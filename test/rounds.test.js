import assert from "node:assert/strict";
import test from "node:test";
import { createRoom, publicRoomState } from "../server/rooms.js";
import { PHASES, PHASE_LENGTHS, advancePhase, privateWhisper, startGame } from "../server/rounds.js";

test("server round flow advances through every timed phase without exposing whispers publicly", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "merchant-a", "Ada");
  room.merchants.set("merchant-b", { id: "merchant-b", name: "Bea" });
  room.merchants.set("merchant-c", { id: "merchant-c", name: "Cy" });
  room.totalRounds = 3;

  startGame(room, "round-flow-test", 1_000);
  assert.equal(room.phase, PHASES.WHISPER);
  assert.equal(room.phaseEndsAt, 1_000 + PHASE_LENGTHS.WHISPER);
  assert.deepEqual(Object.keys(privateWhisper(room, "merchant-a")).sort(), ["direction", "good", "round"]);
  assert.equal(privateWhisper(room, "merchant-a").isTrue, undefined);
  const whisperState = publicRoomState(room);
  assert.equal("outcomes" in whisperState, false);
  assert.equal("whispers" in whisperState, false);
  assert.equal(whisperState.marketTurns, null);

  advancePhase(room, 9_000);
  assert.equal(room.phase, PHASES.TRADE);
  assert.equal(room.phaseEndsAt, 9_000 + PHASE_LENGTHS.TRADE);
  advancePhase(room, 54_000);
  assert.equal(room.phase, PHASES.MARKET_TURNS);
  assert.equal(Object.keys(room.marketTurns).length, 4);
  advancePhase(room, 62_000);
  assert.equal(room.phase, PHASES.LEDGER);
  advancePhase(room, 70_000);
  assert.equal(room.phase, PHASES.WHISPER);
  assert.equal(room.round, 2);
});
