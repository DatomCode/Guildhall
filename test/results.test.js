import assert from "node:assert/strict";
import test from "node:test";
import { createRoom, publicRoomState } from "../server/rooms.js";
import { PHASES, advancePhase, calculateStandings, privateLedger, startGame } from "../server/rounds.js";

test("ledger values, standings, tie-break and badges are computed on the server", () => {
  const rooms = new Map();
  const room = createRoom(rooms, "a", "Ada");
  room.merchants.set("b", { id: "b", name: "Bea" });
  room.merchants.set("c", { id: "c", name: "Cy" });
  room.totalRounds = 3;
  startGame(room, "results", 1_000);
  room.merchants.get("a").cash = 900;
  room.merchants.get("a").holdings.salt = 2;
  room.merchants.get("b").cash = 1_000;
  room.merchants.get("c").cash = 900;
  room.merchants.get("c").holdings.wool = 2;
  room.merchants.get("a").badgeStats = { falseRumors: 0, falseRumorBuyers: 0 };
  room.merchants.get("b").badgeStats = { falseRumors: 2, falseRumorBuyers: 4 };
  room.merchants.get("c").badgeStats = { falseRumors: 1, falseRumorBuyers: 1 };

  const ledger = privateLedger(room, "a");
  assert.equal(ledger.holdingsValue, 100);
  assert.equal(ledger.netWorth, 1_000);
  const standings = calculateStandings(room);
  // Ada and Bea tie on net worth; Bea's larger cash purse wins the tie-break.
  assert.deepEqual(standings.map((entry) => entry.name), ["Bea", "Ada", "Cy"]);
  assert.ok(standings.find((entry) => entry.name === "Ada").badges.includes("Honest Broker"));
  assert.ok(standings.find((entry) => entry.name === "Bea").badges.includes("Smooth Liar"));

  advancePhase(room, 9_000);
  advancePhase(room, 54_000);
  advancePhase(room, 62_000);
  room.round = room.totalRounds;
  advancePhase(room, 70_000);
  assert.equal(room.phase, PHASES.FINAL);
  assert.equal(publicRoomState(room).finalStandings.length, 3);
});
