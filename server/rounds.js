import { applyOutcomes, calculateNetWorth, createSeededRng, DIRECTIONS, drawOutcomes, giveWhispers, startingPrices } from "./economy.js";
import { settleOrders } from "./orders.js";

export const PHASES = Object.freeze({
  LOBBY: "LOBBY",
  WHISPER: "WHISPER",
  TRADE: "TRADE",
  MARKET_TURNS: "MARKET_TURNS",
  LEDGER: "LEDGER",
  FINAL: "FINAL",
});

export const PHASE_LENGTHS = Object.freeze({
  [PHASES.WHISPER]: 8_000,
  [PHASES.TRADE]: 45_000,
  [PHASES.MARKET_TURNS]: 8_000,
  [PHASES.LEDGER]: 8_000,
});

export function startGame(room, seed, now = Date.now()) {
  room.seed = seed;
  room.rng = createSeededRng(seed);
  room.round = 1;
  room.prices = startingPrices();
  room.marketTurns = null;

  for (const merchant of room.merchants.values()) {
    merchant.cash = 1_000;
    merchant.holdings = { salt: 0, wool: 0, amber: 0, indigo: 0 };
    merchant.orders = null;
    merchant.rumorPosted = false;
    merchant.badgeStats = { falseRumors: 0, falseRumorBuyers: 0 };
  }

  enterWhisper(room, now);
}

/** Advances exactly one phase. Call this only from a server timer. */
export function advancePhase(room, now = Date.now()) {
  switch (room.phase) {
    case PHASES.WHISPER:
      setPhase(room, PHASES.TRADE, now);
      break;
    case PHASES.TRADE:
      revealMarketTurn(room, now);
      break;
    case PHASES.MARKET_TURNS:
      setPhase(room, PHASES.LEDGER, now);
      break;
    case PHASES.LEDGER:
      if (room.round >= room.totalRounds) {
        room.phase = PHASES.FINAL;
        room.phaseEndsAt = null;
        room.finalStandings = calculateStandings(room);
      } else {
        room.round += 1;
        enterWhisper(room, now);
      }
      break;
    default:
      throw new Error(`Cannot advance phase ${room.phase}.`);
  }
}

export function privateWhisper(room, merchantId) {
  const whisper = room.whispers?.[merchantId];
  if (!whisper) return null;
  return { good: whisper.good, direction: whisper.direction, round: room.round };
}

/** Server-only bot behavior. Bots never need a socket or client-visible whisper. */
export function runBotsForTrade(room, now = Date.now()) {
  for (const merchant of room.merchants.values()) {
    if (!merchant.isBot) continue;
    const whisper = room.whispers[merchant.id];

    // A bot follows its private whisper 70% of the time; otherwise it holds.
    if (room.rng() < 0.7 && whisper.direction !== "hold") {
      const price = room.prices[whisper.good];
      const side = whisper.direction === "rise" ? "buy" : "sell";
      const units = side === "buy"
        ? Math.min(2, 15 - merchant.holdings[whisper.good], Math.floor(merchant.cash / price))
        : Math.min(2, merchant.holdings[whisper.good]);
      if (units > 0) merchant.orders = { items: [{ good: whisper.good, side, units }], sealedAt: now };
    }

    // Half of the time a bot makes one public rumor; 60% repeat the true outcome.
    if (room.rng() < 0.5) {
      const good = whisper.good;
      const direction = room.rng() < 0.6
        ? room.outcomes[good]
        : chooseOtherDirection(room.outcomes[good], room.rng);
      room.rumors.push({
        id: `bot-rumor-${room.round}-${merchant.id}`,
        merchantId: merchant.id,
        authorName: merchant.name,
        good,
        direction,
        postedAt: now,
        isTrue: null,
        buyersAfter: 0,
        sellersAfter: 0,
      });
      merchant.rumorPosted = true;
    }
  }
}

export function privateLedger(room, merchantId) {
  const merchant = room.merchants.get(merchantId);
  if (!merchant?.holdings) return null;
  const holdingsValue = Object.entries(merchant.holdings)
    .reduce((total, [good, units]) => total + units * room.prices[good], 0);
  const standings = calculateStandings(room);
  const entry = standings.find((candidate) => candidate.id === merchantId);
  return {
    cash: merchant.cash,
    holdings: { ...merchant.holdings },
    holdingsValue,
    netWorth: calculateNetWorth(merchant.cash, merchant.holdings, room.prices),
    rank: entry.rank,
    merchantCount: standings.length,
    orderResults: merchant.lastOrderResults ?? [],
  };
}

export function calculateStandings(room) {
  const standings = [...room.merchants.values()].map((merchant) => ({
    id: merchant.id,
    name: merchant.name,
    cash: merchant.cash ?? 0,
    netWorth: merchant.holdings ? calculateNetWorth(merchant.cash, merchant.holdings, room.prices) : 0,
    falseRumors: merchant.badgeStats?.falseRumors ?? 0,
    falseRumorBuyers: merchant.badgeStats?.falseRumorBuyers ?? 0,
    badges: [],
  })).sort((left, right) => right.netWorth - left.netWorth || right.cash - left.cash || left.name.localeCompare(right.name));

  if (!standings.length) return standings;
  const fewestFalse = Math.min(...standings.map((entry) => entry.falseRumors));
  const mostFalseBuyers = Math.max(...standings.map((entry) => entry.falseRumorBuyers));
  for (const entry of standings) {
    if (entry.falseRumors === fewestFalse) entry.badges.push("Honest Broker");
    if (mostFalseBuyers > 0 && entry.falseRumorBuyers === mostFalseBuyers) entry.badges.push("Smooth Liar");
  }
  for (const [index, entry] of standings.entries()) {
    const prior = standings[index - 1];
    entry.rank = prior && prior.netWorth === entry.netWorth && prior.cash === entry.cash ? prior.rank : index + 1;
    entry.sharedWinner = entry.netWorth === standings[0].netWorth && entry.cash === standings[0].cash;
  }
  return standings;
}

function enterWhisper(room, now) {
  room.outcomes = drawOutcomes(room.rng);
  room.whispers = giveWhispers([...room.merchants.keys()], room.outcomes, room.rng);
  room.marketTurns = null;
  room.rumors = [];
  room.scoredRumors = null;
  setPhase(room, PHASES.WHISPER, now);
}

function revealMarketTurn(room, now) {
  // Snapshot each merchant's sealedAt BEFORE orders are cleared during settlement.
  const sealedAtMap = new Map();
  for (const merchant of room.merchants.values()) {
    if (merchant.orders?.sealedAt) sealedAtMap.set(merchant.id, merchant.orders.sealedAt);
  }

  // Settle orders at current (pre-outcome) prices.
  const settlements = settleOrders([...room.merchants.values()], room.prices);
  for (const result of settlements) {
    const merchant = room.merchants.get(result.merchantId);
    merchant.cash = result.cash;
    merchant.holdings = result.holdings;
    merchant.lastOrderResults = result.orderResults;
    merchant.lastNetWorth = result.netWorth;
    merchant.orders = null;
    merchant.rumorPosted = false;
  }

  // Score rumors now that we know outcomes and settled trades.
  for (const rumor of (room.rumors ?? [])) {
    rumor.isTrue = rumor.direction === room.outcomes[rumor.good];

    let buyers = 0;
    let sellers = 0;
    for (const merchant of room.merchants.values()) {
      if (merchant.id === rumor.merchantId) continue; // skip the rumor author
      const sealedAt = sealedAtMap.get(merchant.id);
      // Only count merchants who sealed their orders AFTER this rumor was posted.
      if (!sealedAt || sealedAt <= rumor.postedAt) continue;
      for (const item of (merchant.lastOrderResults ?? [])) {
        if (item.good !== rumor.good || !item.ok) continue;
        if (item.side === "buy") buyers++;
        else sellers++;
      }
    }
    rumor.buyersAfter = buyers;
    rumor.sellersAfter = sellers;
    if (!rumor.isTrue) {
      const stats = room.merchants.get(rumor.merchantId).badgeStats;
      stats.falseRumors += 1;
      stats.falseRumorBuyers += buyers;
    }
  }

  const oldPrices = { ...room.prices };
  room.prices = applyOutcomes(room.prices, room.outcomes);
  room.marketTurns = Object.fromEntries(Object.entries(room.outcomes).map(([good, direction]) => [good, {
    direction,
    oldPrice: oldPrices[good],
    newPrice: room.prices[good],
  }]));
  room.scoredRumors = (room.rumors ?? []).map(
    ({ id, merchantId, authorName, good, direction, isTrue, buyersAfter, sellersAfter }) =>
      ({ id, merchantId, authorName, good, direction, isTrue, buyersAfter, sellersAfter })
  );
  setPhase(room, PHASES.MARKET_TURNS, now);
}

function setPhase(room, phase, now) {
  room.phase = phase;
  room.phaseEndsAt = now + PHASE_LENGTHS[phase];
}

function chooseOtherDirection(trueDirection, rng) {
  const alternatives = DIRECTIONS.filter((direction) => direction !== trueDirection);
  return alternatives[Math.floor(rng() * alternatives.length)];
}
