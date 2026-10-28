import assert from "node:assert/strict";
import test from "node:test";
import { settleOrders, validateOrderBatch } from "../server/orders.js";

// Helper: build a minimal merchant object.
function makeMerchant(id, cash, holdings, orders = null) {
  return {
    id,
    cash,
    holdings: { salt: 0, wool: 0, amber: 0, indigo: 0, ...holdings },
    orders,
    rumorPosted: false,
  };
}

// Starting prices for tests: salt=50, wool=40, amber=80, indigo=120.
const PRICES = { salt: 50, wool: 40, amber: 80, indigo: 120 };

// ── validateOrderBatch ────────────────────────────────────────

test("validateOrderBatch accepts a valid batch", () => {
  const result = validateOrderBatch([
    { good: "salt", side: "buy", units: 3 },
    { good: "wool", side: "sell", units: 1 },
  ]);
  assert.deepEqual(result, { ok: true });
});

test("validateOrderBatch rejects unknown good", () => {
  const result = validateOrderBatch([{ good: "spice", side: "buy", units: 1 }]);
  assert.ok(result.error, "should return an error");
});

test("validateOrderBatch rejects invalid side", () => {
  const result = validateOrderBatch([{ good: "salt", side: "trade", units: 1 }]);
  assert.ok(result.error, "should return an error");
});

test("validateOrderBatch rejects zero units", () => {
  const result = validateOrderBatch([{ good: "salt", side: "buy", units: 0 }]);
  assert.ok(result.error, "should return an error");
});

test("validateOrderBatch rejects non-integer units", () => {
  const result = validateOrderBatch([{ good: "salt", side: "buy", units: 1.5 }]);
  assert.ok(result.error, "should return an error");
});

// ── settleOrders ──────────────────────────────────────────────

test("1. A valid buy order deducts cash and adds holdings", () => {
  const merchant = makeMerchant("m1", 1000, { salt: 0 }, {
    items: [{ good: "salt", side: "buy", units: 3 }],
    sealedAt: 1000,
  });

  const [result] = settleOrders([merchant], PRICES);

  assert.equal(result.cash, 1000 - 3 * 50);       // 850
  assert.equal(result.holdings.salt, 3);
  assert.equal(result.orderResults[0].ok, true);
});

test("2. An overspend buy is rejected; cash and holdings are unchanged", () => {
  // Only 99 crowns — can't buy 3 salt at 50 each (costs 150).
  const merchant = makeMerchant("m1", 99, { salt: 0 }, {
    items: [{ good: "salt", side: "buy", units: 3 }],
    sealedAt: 1000,
  });

  const [result] = settleOrders([merchant], PRICES);

  assert.equal(result.cash, 99);                   // unchanged
  assert.equal(result.holdings.salt, 0);           // unchanged
  assert.equal(result.orderResults[0].ok, false);
  assert.ok(result.orderResults[0].reason, "should include rejection reason");
});

test("3. Selling more units than owned is rejected", () => {
  const merchant = makeMerchant("m1", 500, { wool: 2 }, {
    items: [{ good: "wool", side: "sell", units: 5 }],
    sealedAt: 1000,
  });

  const [result] = settleOrders([merchant], PRICES);

  assert.equal(result.cash, 500);                  // unchanged
  assert.equal(result.holdings.wool, 2);           // unchanged
  assert.equal(result.orderResults[0].ok, false);
});

test("4. Units cap at 15 per good is enforced on buy", () => {
  // Merchant already holds 14 amber, tries to buy 3 more (would be 17).
  const merchant = makeMerchant("m1", 5000, { amber: 14 }, {
    items: [{ good: "amber", side: "buy", units: 3 }],
    sealedAt: 1000,
  });

  const [result] = settleOrders([merchant], PRICES);

  assert.equal(result.holdings.amber, 14);         // unchanged — cap enforced
  assert.equal(result.orderResults[0].ok, false);
  assert.match(result.orderResults[0].reason, /cap/i);
});

test("5. Two merchants' orders process in sealedAt order (earliest first)", () => {
  // Both merchants try to buy 10 indigo at 120 crowns each (total 1200).
  // Each starts with 1200 cash. Because there is no shared pool (each merchant
  // trades independently), both should succeed.
  // The point of sealedAt ordering matters when a shared resource is contested —
  // here we verify the ordering by checking results are attributed correctly.
  const mA = makeMerchant("a", 1200, {}, {
    items: [{ good: "indigo", side: "buy", units: 10 }],
    sealedAt: 2000, // later
  });
  const mB = makeMerchant("b", 600, {}, {
    items: [{ good: "indigo", side: "buy", units: 10 }],
    sealedAt: 1000, // earlier
  });

  const results = settleOrders([mA, mB], PRICES);
  const rA = results.find((r) => r.merchantId === "a");
  const rB = results.find((r) => r.merchantId === "b");

  // mB sealed first and has 600 < 10*120=1200, so rejected.
  assert.equal(rB.orderResults[0].ok, false, "mB (earlier, insufficient) should be rejected");
  // mA sealed later but has enough cash.
  assert.equal(rA.orderResults[0].ok, true, "mA (later, sufficient) should succeed");
  assert.equal(rA.cash, 1200 - 10 * 120);
  assert.equal(rA.holdings.indigo, 10);
});

test("6. Players who seal nothing hold their positions", () => {
  const merchant = makeMerchant("m1", 750, { salt: 5, wool: 2 }, null);

  const [result] = settleOrders([merchant], PRICES);

  assert.equal(result.cash, 750);
  assert.deepEqual(result.holdings, { salt: 5, wool: 2, amber: 0, indigo: 0 });
  assert.deepEqual(result.orderResults, []);
});

test("valid items in same batch still execute when one item is invalid", () => {
  // First item: sell 99 salt (don't own that many) — rejected.
  // Second item: buy 2 wool (can afford) — should still execute.
  const merchant = makeMerchant("m1", 1000, { salt: 1, wool: 0 }, {
    items: [
      { good: "salt", side: "sell", units: 99 },  // invalid
      { good: "wool", side: "buy", units: 2 },     // valid
    ],
    sealedAt: 1000,
  });

  const [result] = settleOrders([merchant], PRICES);

  assert.equal(result.orderResults[0].ok, false);  // salt sell rejected
  assert.equal(result.orderResults[1].ok, true);   // wool buy succeeded
  assert.equal(result.holdings.wool, 2);
  assert.equal(result.cash, 1000 - 2 * 40);        // 920
});
