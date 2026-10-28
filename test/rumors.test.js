import assert from "node:assert/strict";
import test from "node:test";
import { createRoom, publicRoomState } from "../server/rooms.js";
import { PHASES, advancePhase, startGame } from "../server/rounds.js";

test("rumors in publicRoomState hide truth and trade impact during TRADE phase", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "m1", "Merchant 1");
  room.merchants.set("m2", { id: "m2", name: "Merchant 2" });
  room.merchants.set("m3", { id: "m3", name: "Merchant 3" });

  startGame(room, "rumor-seed-1", 1000);
  advancePhase(room, 9000); // Now in TRADE

  room.rumors.push({
    id: "rumor-1",
    merchantId: "m1",
    authorName: "Merchant 1",
    good: "salt",
    direction: "rise",
    postedAt: 12000,
    isTrue: null,
    buyersAfter: 0,
    sellersAfter: 0,
  });

  const state = publicRoomState(room);
  assert.equal(state.phase, PHASES.TRADE);
  assert.equal(state.rumors.length, 1);
  assert.equal(state.rumors[0].authorName, "Merchant 1");
  assert.equal(state.rumors[0].good, "salt");
  assert.equal(state.rumors[0].direction, "rise");
  // Security check: isTrue, buyersAfter, sellersAfter must NOT be in public state during TRADE
  assert.equal(state.rumors[0].isTrue, undefined);
  assert.equal(state.rumors[0].buyersAfter, undefined);
  assert.equal(state.rumors[0].sellersAfter, undefined);
});

test("rumor truth and buyers/sellers after posting are correctly scored at MARKET_TURNS", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "m1", "Alice");
  room.merchants.set("m2", { id: "m2", name: "Bob", cash: 1000, holdings: { salt: 2, wool: 5, amber: 0, indigo: 0 } });
  room.merchants.set("m3", { id: "m3", name: "Charlie", cash: 1000, holdings: { salt: 0, wool: 5, amber: 0, indigo: 0 } });
  room.merchants.set("m4", { id: "m4", name: "Dave", cash: 1000, holdings: { salt: 0, wool: 0, amber: 0, indigo: 0 } });

  startGame(room, "rumor-seed-test", 1000);
  advancePhase(room, 9000); // TRADE phase

  // Alice posts rumor on salt (will rise) at t=15000
  room.rumors.push({
    id: "r1",
    merchantId: "m1",
    authorName: "Alice",
    good: "salt",
    direction: "rise",
    postedAt: 15000,
    isTrue: null,
    buyersAfter: 0,
    sellersAfter: 0,
  });

  // Bob sealed an order BEFORE Alice's rumor (at t=12000) -> should NOT be counted in Alice's rumor impact
  room.merchants.get("m2").orders = {
    sealedAt: 12000,
    items: [{ good: "salt", side: "buy", units: 1 }],
  };

  // Charlie sealed an order AFTER Alice's rumor (at t=20000) buying 2 salt -> SHOULD be counted
  room.merchants.get("m3").orders = {
    sealedAt: 20000,
    items: [{ good: "salt", side: "buy", units: 2 }],
  };

  // Alice (author) also buys salt at t=21000 -> author's own trade must NOT count in their own rumor
  room.merchants.get("m1").orders = {
    sealedAt: 21000,
    items: [{ good: "salt", side: "buy", units: 1 }],
  };

  // Dave sealed an order AFTER Alice's rumor (at t=22000) selling wool -> unrelated good, doesn't count
  room.merchants.get("m4").orders = {
    sealedAt: 22000,
    items: [{ good: "wool", side: "buy", units: 1 }],
  };

  // Advance to MARKET_TURNS
  advancePhase(room, 54000);
  assert.equal(room.phase, PHASES.MARKET_TURNS);

  const state = publicRoomState(room);
  assert.equal(state.rumors.length, 1);
  const scoredAliceRumor = state.rumors[0];

  assert.equal(scoredAliceRumor.authorName, "Alice");
  assert.equal(scoredAliceRumor.isTrue, room.marketTurns.salt.direction === "rise");
  // Charlie was the only other merchant who bought salt after Alice's rumor was posted
  assert.equal(scoredAliceRumor.buyersAfter, 1);
  assert.equal(scoredAliceRumor.sellersAfter, 0);
});

test("rumor seller impact counts other merchants who sold after the rumor was posted", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "m1", "Alice");
  room.merchants.set("m2", { id: "m2", name: "Bob" });
  room.merchants.set("m3", { id: "m3", name: "Charlie" });

  startGame(room, "rumor-seed-sell", 1000);
  // Give merchants holdings to sell in this round
  room.merchants.get("m2").holdings.wool = 4;
  room.merchants.get("m3").holdings.wool = 2;

  advancePhase(room, 9000); // TRADE

  // Alice posts rumor that wool will fall at t=15000
  room.rumors.push({
    id: "r-wool",
    merchantId: "m1",
    authorName: "Alice",
    good: "wool",
    direction: "fall",
    postedAt: 15000,
    isTrue: null,
    buyersAfter: 0,
    sellersAfter: 0,
  });

  // Bob sells wool at t=18000
  room.merchants.get("m2").orders = {
    sealedAt: 18000,
    items: [{ good: "wool", side: "sell", units: 2 }],
  };

  // Charlie sells wool at t=19000
  room.merchants.get("m3").orders = {
    sealedAt: 19000,
    items: [{ good: "wool", side: "sell", units: 1 }],
  };

  advancePhase(room, 54000); // MARKET_TURNS
  const state = publicRoomState(room);
  const scoredRumor = state.rumors[0];

  assert.equal(scoredRumor.buyersAfter, 0);
  assert.equal(scoredRumor.sellersAfter, 2);
  assert.equal(scoredRumor.isTrue, room.marketTurns.wool.direction === "fall");
});
