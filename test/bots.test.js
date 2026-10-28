import assert from "node:assert/strict";
import test from "node:test";
import { addBotMerchants, createRoom, publicRoomState } from "../server/rooms.js";
import { PHASES, runBotsForTrade, startGame } from "../server/rounds.js";

test("bot rooms add three clearly marked server-controlled merchants", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "human", "Ada");
  addBotMerchants(room);
  const state = publicRoomState(room);
  assert.equal(state.merchantCount, 4);
  assert.equal(state.merchants.filter((merchant) => merchant.isBot).length, 3);
});

test("bots use private whispers for server-side orders and rumors", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "human", "Ada");
  addBotMerchants(room, 1);
  startGame(room, "bot-behavior", 1_000);
  room.phase = PHASES.TRADE;
  const bot = [...room.merchants.values()].find((merchant) => merchant.isBot);
  room.whispers[bot.id] = { good: "salt", direction: "rise", isTrue: true };
  room.outcomes.salt = "rise";
  room.rng = (() => {
    const values = [0.1, 0.1, 0.1]; // follow, post, honest
    return () => values.shift() ?? 0.1;
  })();

  runBotsForTrade(room, 2_000);
  assert.deepEqual(bot.orders.items[0], { good: "salt", side: "buy", units: 2 });
  assert.equal(room.rumors[0].direction, "rise");
  assert.equal(room.rumors[0].isTrue, null);
});
