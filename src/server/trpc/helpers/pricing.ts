/**
 * Bounded cost-function AMM helpers (sigmoid corridor).
 *
 * Price is bounded in [PRICE_MIN, PRICE_MAX] and trade cost is derived
 * from a convex potential to preserve path independence.
 */

const PRICE_MIN = 0.01;
const PRICE_MAX = 0.99;
const PRICE_K = 0.85;

const clampExpInput = (value: number) => {
  if (value > 60) return 60;
  if (value < -60) return -60;
  return value;
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-clampExpInput(x)));

const softplus = (x: number) => {
  const v = clampExpInput(x);
  const abs = Math.abs(v);
  return Math.max(v, 0) + Math.log1p(Math.exp(-abs));
};

/**
 * Calculate bounded YES price from market state
 */
export function calculateBoundedPriceYes(qYes: number, qNo: number, b: number): number {
  if (!Number.isFinite(b) || b <= 0) return 0.5;
  const s = qYes - qNo;
  const x = (PRICE_K * s) / b;
  return PRICE_MIN + (PRICE_MAX - PRICE_MIN) * sigmoid(x);
}

/**
 * Calculate both YES and NO prices (bounded)
 */
export function calculateBoundedPrices(qYes: number, qNo: number, b: number): { priceYes: number; priceNo: number } {
  const priceYes = calculateBoundedPriceYes(qYes, qNo, b);
  return {
    priceYes,
    priceNo: 1 - priceYes,
  };
}

/**
 * Bounded cost function C(s)
 */
export function boundedCost(qYes: number, qNo: number, b: number): number {
  if (!Number.isFinite(b) || b <= 0) return 0;
  const s = qYes - qNo;
  const x = (PRICE_K * s) / b;
  return PRICE_MIN * s + (PRICE_MAX - PRICE_MIN) * (b / PRICE_K) * softplus(x);
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
  const currentCost = boundedCost(qYes, qNo, b);
  const newQYes = side === "YES" ? qYes + shares : qYes;
  const newQNo = side === "NO" ? qNo + shares : qNo;
  const newCost = boundedCost(newQYes, newQNo, b);
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
  const currentCost = boundedCost(qYes, qNo, b);
  const newQYes = side === "YES" ? qYes - shares : qYes;
  const newQNo = side === "NO" ? qNo - shares : qNo;
  const newCost = boundedCost(newQYes, newQNo, b);
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

/**
 * Stable softmax probabilities for N-outcome markets.
 * Prices are interpreted as probabilities in [0, 1] summing to 1.
 */
export function calculateSoftmaxProbabilities(q: number[], b: number): number[] {
  if (!Array.isArray(q) || q.length === 0) return [];
  if (!Number.isFinite(b) || b <= 0) {
    const fallback = 1 / q.length;
    return q.map(() => fallback);
  }

  const logits = q.map((qi) => (PRICE_K * (Number.isFinite(qi) ? qi : 0)) / b);
  const maxLogit = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(clampExpInput(z - maxLogit)));
  const denom = exps.reduce((sum, v) => sum + v, 0);
  if (!Number.isFinite(denom) || denom <= 0) {
    const fallback = 1 / q.length;
    return q.map(() => fallback);
  }
  return exps.map((v) => v / denom);
}

/**
 * N-outcome LMSR-like convex potential using log-sum-exp.
 * The derivative wrt q_i is softmax probability.
 */
export function multiOutcomeCost(q: number[], b: number): number {
  if (!Array.isArray(q) || q.length === 0) return 0;
  if (!Number.isFinite(b) || b <= 0) return 0;

  const logits = q.map((qi) => (PRICE_K * (Number.isFinite(qi) ? qi : 0)) / b);
  const maxLogit = Math.max(...logits);
  const sumExp = logits.reduce((sum, z) => sum + Math.exp(clampExpInput(z - maxLogit)), 0);
  return (b / PRICE_K) * (maxLogit + Math.log(Math.max(sumExp, 1e-30)));
}

export function calculateMultiOutcomeBuyCost(
  q: number[],
  outcomeIndex: number,
  shares: number,
  b: number
): number {
  if (!Array.isArray(q) || q.length === 0) return 0;
  if (outcomeIndex < 0 || outcomeIndex >= q.length) return 0;
  if (!Number.isFinite(shares) || shares <= 0) return 0;
  const before = multiOutcomeCost(q, b);
  const next = [...q];
  next[outcomeIndex] = (next[outcomeIndex] ?? 0) + shares;
  const after = multiOutcomeCost(next, b);
  return after - before;
}

export function calculateMultiOutcomeSellProceeds(
  q: number[],
  outcomeIndex: number,
  shares: number,
  b: number
): number {
  if (!Array.isArray(q) || q.length === 0) return 0;
  if (outcomeIndex < 0 || outcomeIndex >= q.length) return 0;
  if (!Number.isFinite(shares) || shares <= 0) return 0;
  const before = multiOutcomeCost(q, b);
  const next = [...q];
  next[outcomeIndex] = (next[outcomeIndex] ?? 0) - shares;
  const after = multiOutcomeCost(next, b);
  return before - after;
}

/**
 * Solve shares from target collateral via binary search.
 */
export function solveSharesForBuyCost(
  q: number[],
  outcomeIndex: number,
  targetCost: number,
  b: number
): number {
  if (targetCost <= 0 || !Number.isFinite(targetCost)) return 0;
  let lo = 0;
  let hi = Math.max(targetCost, 1e-6);
  while (calculateMultiOutcomeBuyCost(q, outcomeIndex, hi, b) < targetCost) {
    hi *= 2;
    if (hi > 1e12) break;
  }
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const cost = calculateMultiOutcomeBuyCost(q, outcomeIndex, mid, b);
    if (Math.abs(cost - targetCost) <= 1e-9) return mid;
    if (cost < targetCost) lo = mid;
    else hi = mid;
  }
  return hi;
}
