import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOD_IDS,
  applyOutcomes,
  calculateNetWorth,
  createSeededRng,
  drawOutcomes,
  giveWhispers,
  startingPrices,
} from "../server/economy.js";

test("seeded generators replay identical draws", () => {
  const first = createSeededRng("guildhall-debug-17");
  const second = createSeededRng("guildhall-debug-17");
  assert.deepEqual(Array.from({ length: 12 }, first), Array.from({ length: 12 }, second));
});

test("starting prices, outcome resolution, and net worth follow the game rules", () => {
  assert.deepEqual(startingPrices(), { salt: 50, wool: 40, amber: 80, indigo: 120 });
  assert.deepEqual(
    applyOutcomes(startingPrices(), { salt: "rise", wool: "fall", amber: "hold", indigo: "fall" }),
    { salt: 63, wool: 30, amber: 80, indigo: 90 },
  );
  assert.deepEqual(
    applyOutcomes({ salt: 5, wool: 5, amber: 5, indigo: 5 }, { salt: "fall", wool: "fall", amber: "fall", indigo: "fall" }),
    { salt: 5, wool: 5, amber: 5, indigo: 5 },
  );
  assert.equal(calculateNetWorth(800, { salt: 2, wool: 1, amber: 0, indigo: 1 }, startingPrices()), 1060);
});

test("whispers cover every good when possible and false whispers never repeat the truth", () => {
  const outcomes = { salt: "rise", wool: "fall", amber: "hold", indigo: "rise" };
  const whispers = giveWhispers(["a", "b", "c", "d", "e", "f"], outcomes, createSeededRng(99));
  assert.deepEqual(new Set(Object.values(whispers).map((whisper) => whisper.good)), new Set(GOOD_IDS));

  for (const whisper of Object.values(whispers)) {
    if (!whisper.isTrue) assert.notEqual(whisper.direction, outcomes[whisper.good]);
  }
});

test("10,000 simulated whispers are 66-74% true and outcomes stay near 35/35/30", () => {
  const rng = createSeededRng("economy-distribution-test");
  const frequencies = { rise: 0, fall: 0, hold: 0 };
  let trueWhispers = 0;
  let whisperCount = 0;

  for (let round = 0; round < 2_500; round += 1) {
    const outcomes = drawOutcomes(rng);
    for (const outcome of Object.values(outcomes)) frequencies[outcome] += 1;

    const whispers = giveWhispers(["a", "b", "c", "d"], outcomes, rng);
    for (const whisper of Object.values(whispers)) {
      trueWhispers += Number(whisper.isTrue);
      whisperCount += 1;
    }
  }

  const trueShare = trueWhispers / whisperCount;
  assert.ok(trueShare >= 0.66 && trueShare <= 0.74, `True whisper rate was ${(trueShare * 100).toFixed(2)}%.`);

  const outcomeCount = 10_000;
  for (const [direction, expectedShare] of Object.entries({ rise: 0.35, fall: 0.35, hold: 0.3 })) {
    const actualShare = frequencies[direction] / outcomeCount;
    assert.ok(Math.abs(actualShare - expectedShare) <= 0.02, `${direction} frequency was ${(actualShare * 100).toFixed(2)}%.`);
  }
});
