export const GOODS = Object.freeze({
  salt: Object.freeze({ name: "Salt", startPrice: 50 }),
  wool: Object.freeze({ name: "Wool", startPrice: 40 }),
  amber: Object.freeze({ name: "Amber", startPrice: 80 }),
  indigo: Object.freeze({ name: "Indigo", startPrice: 120 }),
});

export const GOOD_IDS = Object.freeze(Object.keys(GOODS));
export const DIRECTIONS = Object.freeze(["rise", "fall", "hold"]);

/**
 * Returns a deterministic pseudo-random number generator in the range [0, 1).
 * Store the seed with a game to replay its economy for debugging.
 */
export function createSeededRng(seed) {
  let state = normaliseSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function startingPrices() {
  return Object.fromEntries(GOOD_IDS.map((good) => [good, GOODS[good].startPrice]));
}

/** Draws server-private price directions at 35% rise, 35% fall, and 30% hold. */
export function drawOutcomes(rng) {
  return Object.fromEntries(GOOD_IDS.map((good) => [good, drawDirection(rng)]));
}

/**
 * Produces server-private whispers. The first merchants receive a shuffled, unique
 * good assignment, so every good is covered whenever there are at least four merchants.
 */
export function giveWhispers(merchantIds, outcomes, rng) {
  assertOutcomes(outcomes);
  const coverageOrder = shuffle([...GOOD_IDS], rng);
  const whispers = {};

  merchantIds.forEach((merchantId, index) => {
    const good = coverageOrder[index % GOOD_IDS.length];
    const trueDirection = outcomes[good];
    const isTrue = rng() < 0.7;
    whispers[merchantId] = {
      good,
      direction: isTrue ? trueDirection : chooseDifferentDirection(trueDirection, rng),
      isTrue,
    };
  });

  return whispers;
}

/** Applies the previously hidden directions after the market turns. */
export function applyOutcomes(prices, outcomes) {
  assertOutcomes(outcomes);
  return Object.fromEntries(GOOD_IDS.map((good) => {
    const oldPrice = prices[good];
    if (!Number.isFinite(oldPrice) || oldPrice < 0) {
      throw new Error(`Invalid price for ${good}.`);
    }

    const multiplier = outcomes[good] === "rise" ? 1.25 : outcomes[good] === "fall" ? 0.75 : 1;
    return [good, Math.max(5, Math.round(oldPrice * multiplier))];
  }));
}

export function calculateNetWorth(cash, holdings, prices) {
  if (!Number.isFinite(cash)) throw new Error("Cash must be a finite number.");

  return GOOD_IDS.reduce((total, good) => {
    const units = holdings[good] ?? 0;
    const price = prices[good];
    if (!Number.isInteger(units) || units < 0 || !Number.isFinite(price)) {
      throw new Error(`Invalid holdings or price for ${good}.`);
    }
    return total + units * price;
  }, cash);
}

function drawDirection(rng) {
  const roll = rng();
  if (roll < 0.35) return "rise";
  if (roll < 0.7) return "fall";
  return "hold";
}

function chooseDifferentDirection(trueDirection, rng) {
  const alternatives = DIRECTIONS.filter((direction) => direction !== trueDirection);
  return alternatives[Math.floor(rng() * alternatives.length)];
}

function shuffle(values, rng) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function assertOutcomes(outcomes) {
  for (const good of GOOD_IDS) {
    if (!DIRECTIONS.includes(outcomes[good])) throw new Error(`Invalid outcome for ${good}.`);
  }
}

function normaliseSeed(seed) {
  if (Number.isInteger(seed)) return seed >>> 0;

  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
