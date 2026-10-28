import assert from "node:assert/strict";
import test from "node:test";
import { applyOutcomes } from "../server/economy.js";
import { createRoom, disconnectMerchant, joinRoom, promoteSpectators } from "../server/rooms.js";
import { calculateStandings, startGame } from "../server/rounds.js";

test("a disconnected host passes the guildhall to the next merchant", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "a", "Ada");
  room.merchants.set("b", { id: "b", name: "Bea", connected: true });
  disconnectMerchant(room, "a");
  assert.equal(room.hostId, "b");
});

test("late arrivals spectate and become merchants only for the next game", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "a", "Ada");
  room.phase = "TRADE";
  const joined = joinRoom(rooms, room.code, "b", "Bea");
  assert.equal(joined.role, "spectator");
  assert.equal(room.merchants.has("b"), false);
  promoteSpectators(room);
  assert.equal(room.merchants.has("b"), true);
});

test("the five-crown floor and shared first victory are server enforced", () => {
  const outcomes = { salt: "fall", wool: "fall", amber: "fall", indigo: "fall" };
  assert.equal(applyOutcomes({ salt: 5, wool: 5, amber: 5, indigo: 5 }, outcomes).salt, 5);
  const rooms = new Map();
  const room = createRoom(rooms, "a", "Ada");
  room.merchants.set("b", { id: "b", name: "Bea" });
  startGame(room, "ties");
  const standings = calculateStandings(room);
  assert.equal(standings[0].sharedWinner, true);
  assert.equal(standings[1].sharedWinner, true);
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 1);
});
