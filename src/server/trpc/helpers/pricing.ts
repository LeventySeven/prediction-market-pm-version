/**
 * LMSR (Logarithmic Market Scoring Rule) pricing helpers
 * 
 * LMSR calculates prices based on quantity of shares (q_yes, q_no) and liquidity parameter (b).
 * Price formula: price_yes = e^(q_yes/b) / (e^(q_yes/b) + e^(q_no/b))
 * 
 * For numerical stability we use the softmax form:
 * price_yes = 1 / (1 + e^((q_no - q_yes)/b))
 */

/**
 * Calculate current YES price from LMSR state
 */
export function calculateLMSRPriceYes(qYes: number, qNo: number, b: number): number {
  if (b <= 0) return 0.5;
  const diff = (qNo - qYes) / b;
  // Clamp to avoid overflow
  if (diff > 700) return 0;
  if (diff < -700) return 1;
  return 1 / (1 + Math.exp(diff));
}

/**
 * Calculate both YES and NO prices
 */
export function calculateLMSRPrices(qYes: number, qNo: number, b: number): { priceYes: number; priceNo: number } {
  const priceYes = calculateLMSRPriceYes(qYes, qNo, b);
  return {
    priceYes,
    priceNo: 1 - priceYes,
  };
}

/**
 * LMSR cost function: C(q) = b * ln(e^(q_yes/b) + e^(q_no/b))
 * For numerical stability: C(q) = max(q_yes, q_no)/b + b * ln(1 + e^(-|q_yes - q_no|/b))
 */
export function lmsrCost(qYes: number, qNo: number, b: number): number {
  if (b <= 0) return 0;
  const maxQ = Math.max(qYes, qNo);
  const diff = Math.abs(qYes - qNo) / b;
  // For large diff, ln(1 + e^-diff) ≈ 0
  if (diff > 700) {
    return maxQ;
  }
  return maxQ + b * Math.log(1 + Math.exp(-diff));
}

/**
 * Calculate cost to buy `shares` of `side` given current state
 * Returns the collateral required (positive number)
 */
export function calculateBuyCost(
  qYes: number,
  qNo: number,
  b: number,
  side: "YES" | "NO",
  shares: number
): number {
  const currentCost = lmsrCost(qYes, qNo, b);
  const newQYes = side === "YES" ? qYes + shares : qYes;
  const newQNo = side === "NO" ? qNo + shares : qNo;
  const newCost = lmsrCost(newQYes, newQNo, b);
  return newCost - currentCost;
}

/**
 * Calculate proceeds from selling `shares` of `side`
 * Returns the collateral received (positive number)
 */
export function calculateSellProceeds(
  qYes: number,
  qNo: number,
  b: number,
  side: "YES" | "NO",
  shares: number
): number {
  const currentCost = lmsrCost(qYes, qNo, b);
  const newQYes = side === "YES" ? qYes - shares : qYes;
  const newQNo = side === "NO" ? qNo - shares : qNo;
  const newCost = lmsrCost(newQYes, newQNo, b);
  return currentCost - newCost;
}

/**
 * Convert major units (user-facing) to minor units (DB storage)
 * e.g., 1.5 VCOIN with decimals=6 -> 1500000 minor units
 */
export function toMinorUnits(amount: number, decimals: number): number {
  return Math.floor(amount * Math.pow(10, decimals));
}

/**
 * Convert minor units to major units
 */
export function toMajorUnits(minorAmount: number, decimals: number): number {
  return minorAmount / Math.pow(10, decimals);
}

/**
 * Legacy function for backwards compatibility during migration
 * Maps pool-based pricing to simple ratio (will be removed after full migration)
 */
export function calculatePrices(poolYes: number, poolNo: number): { priceYes: number; priceNo: number } {
  const yes = Number(poolYes) || 0;
  const no = Number(poolNo) || 0;
  const total = yes + no;
  if (total === 0) {
    return { priceYes: 0.5, priceNo: 0.5 };
  }
  const priceYes = yes / total;
  const priceNo = no / total;
  return { priceYes, priceNo };
}
