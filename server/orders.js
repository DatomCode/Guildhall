import { GOOD_IDS, calculateNetWorth } from "./economy.js";

const MAX_UNITS = 15;

/**
 * Validates an order batch payload.
 * Returns { ok: true } or { error: "..." }.
 */
export function validateOrderBatch(items) {
  if (!Array.isArray(items)) return { error: "Items must be an array." };

  for (const item of items) {
    if (!GOOD_IDS.includes(item.good)) {
      return { error: `Unknown good: ${item.good}.` };
    }
    if (item.side !== "buy" && item.side !== "sell") {
      return { error: `Side must be "buy" or "sell", got: ${item.side}.` };
    }
    if (!Number.isInteger(item.units) || item.units < 1) {
      return { error: `Units must be a positive integer, got: ${item.units}.` };
    }
  }

  return { ok: true };
}

/**
 * Pure settlement function. Processes each merchant's sealed orders against
 * current prices. Merchants are processed in sealedAt order (earliest first).
 *
 * @param {Array} merchantsArray - Array of merchant objects.
 * @param {Object} prices - Map of good -> price.
 * @returns {Array} Array of { merchantId, cash, holdings, orderResults }.
 */
export function settleOrders(merchantsArray, prices) {
  // Sort by sealedAt ascending (merchants with no orders sort last / ignored).
  const withOrders = merchantsArray
    .filter((m) => m.orders)
    .sort((a, b) => a.orders.sealedAt - b.orders.sealedAt);

  // Build working copies of cash and holdings for all merchants.
  const state = new Map(
    merchantsArray.map((m) => [
      m.id,
      {
        cash: m.cash,
        holdings: { ...m.holdings },
        orderResults: [],
      },
    ]),
  );

  for (const merchant of withOrders) {
    const s = state.get(merchant.id);

    for (const item of merchant.orders.items) {
      const { good, units, side } = item;
      const price = prices[good];

      if (side === "buy") {
        const cost = units * price;
        const newHoldings = s.holdings[good] + units;

        if (cost > s.cash) {
          s.orderResults.push({ good, side, units, ok: false, reason: "Insufficient funds." });
        } else if (newHoldings > MAX_UNITS) {
          s.orderResults.push({ good, side, units, ok: false, reason: "Holdings cap of 15 reached." });
        } else {
          s.cash -= cost;
          s.holdings[good] = newHoldings;
          s.orderResults.push({ good, side, units, ok: true });
        }
      } else {
        // sell
        if (s.holdings[good] < units) {
          s.orderResults.push({ good, side, units, ok: false, reason: "Insufficient units." });
        } else {
          s.cash += units * price;
          s.holdings[good] -= units;
          s.orderResults.push({ good, side, units, ok: true });
        }
      }
    }
  }

  return merchantsArray.map((m) => {
    const s = state.get(m.id);
    const netWorth = calculateNetWorth(s.cash, s.holdings, prices);
    return {
      merchantId: m.id,
      cash: s.cash,
      holdings: s.holdings,
      netWorth,
      orderResults: s.orderResults,
    };
  });
}
