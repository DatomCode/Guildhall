import assert from "node:assert/strict";
import test from "node:test";
import { applyOutcomes } from "../server/economy.js";
import { settleOrders } from "../server/orders.js";
import { createRoom, disconnectMerchant, publicRoomState } from "../server/rooms.js";
import { PHASES, advancePhase, calculateStandings, startGame } from "../server/rounds.js";

const PRICES = { salt: 50, wool: 40, amber: 80, indigo: 120 };

test("overspending and the 15-unit cap never change a merchant's server state", () => {
  const [result] = settleOrders([{
    id: "merchant",
    cash: 99,
    holdings: { salt: 0, wool: 0, amber: 15, indigo: 0 },
    orders: {
      sealedAt: 1,
      items: [
        { good: "salt", side: "buy", units: 2 },
        { good: "amber", side: "buy", units: 1 },
      ],
    },
  }], PRICES);
  assert.equal(result.cash, 99);
  assert.equal(result.holdings.salt, 0);
  assert.equal(result.holdings.amber, 15);
  assert.match(result.orderResults[0].reason, /funds/i);
  assert.match(result.orderResults[1].reason, /cap/i);
});

test("a disconnected merchant's sealed TRADE batch is applied, while their connection state changes", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "a", "Ada");
  room.merchants.set("b", { id: "b", name: "Bea", connected: true });
  startGame(room, "disconnect-trade", 1_000);
  advancePhase(room, 9_000);
  assert.equal(room.phase, PHASES.TRADE);
  const bea = room.merchants.get("b");
  bea.orders = { sealedAt: 10_000, items: [{ good: "salt", side: "buy", units: 2 }] };
  disconnectMerchant(room, "b");
  assert.equal(bea.connected, false);
  assert.deepEqual(bea.orders.items, [{ good: "salt", side: "buy", units: 2 }]);
  advancePhase(room, 54_000);
  assert.equal(bea.holdings.salt, 2);
  assert.equal(bea.cash, 900);
});

test("public phase payloads keep outcomes and rumor verdicts private until MARKET_TURNS", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "a", "Ada");
  room.merchants.set("b", { id: "b", name: "Bea" });
  startGame(room, "payload-audit", 1_000);
  room.rumors.push({
    id: "r1", merchantId: "a", authorName: "Ada", good: "salt", direction: "rise", postedAt: 2_000,
    isTrue: null, buyersAfter: 0, sellersAfter: 0,
  });
  advancePhase(room, 9_000);
  const tradeState = publicRoomState(room);
  assert.equal(tradeState.marketTurns, null);
  assert.equal("outcomes" in tradeState, false);
  assert.equal("whispers" in tradeState, false);
  assert.equal(tradeState.rumors[0].isTrue, undefined);
  advancePhase(room, 54_000);
  const revealedState = publicRoomState(room);
  assert.ok(revealedState.marketTurns.salt);
  assert.equal(typeof revealedState.rumors[0].isTrue, "boolean");
});

test("the price floor and final tie rules are stable", () => {
  const down = { salt: "fall", wool: "fall", amber: "fall", indigo: "fall" };
  assert.equal(applyOutcomes({ salt: 5, wool: 5, amber: 5, indigo: 5 }, down).indigo, 5);
  const rooms = new Map();
  const room = createRoom(rooms, "a", "Ada");
  room.merchants.set("b", { id: "b", name: "Bea" });
  startGame(room, "tie-audit");
  const standings = calculateStandings(room);
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 1);
  assert.equal(standings[0].sharedWinner, true);
  assert.equal(standings[1].sharedWinner, true);
});
