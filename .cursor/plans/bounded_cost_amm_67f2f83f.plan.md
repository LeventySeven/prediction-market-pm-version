---
name: bounded_cost_amm
overview: Introduce bounded 1–99% sigmoid-based cost-function pricing off-chain (Supabase SQL + server helpers) while keeping non-custodial flow and current on-chain scaffolding unchanged.
todos:
  - id: update-pricing-helpers
    content: Add bounded price/cost helpers in pricing.ts
    status: completed
  - id: update-sql-cost
    content: Replace LMSR in place_bet_tx.sql with bounded cost math
    status: completed
  - id: align-market-pricing
    content: Switch market price mapping to bounded helper
    status: completed
  - id: sanity-check
    content: Quick sanity check build/tests
    status: completed
isProject: false
---

# Bounded Probability Cost AMM

## Approach

- Keep all funds off-chain and only adjust pricing math (no custody changes).
- Replace the LMSR price/cost functions with a bounded sigmoid price curve derived from a convex cost function C(s) so trade cost remains path-independent.
- Apply the new pricing in **two places**: the Supabase SQL functions (authoritative trade execution) and the server-side pricing helpers used for UI/quotes.

## Files to change

- [db/functions/place_bet_tx.sql](db/functions/place_bet_tx.sql): replace `lmsr_cost_safe`/`lmsr_price_yes_safe` logic with bounded sigmoid cost/price using stable softplus, and keep cost computed as `C(after)-C(before)`.
- [src/server/trpc/helpers/pricing.ts](src/server/trpc/helpers/pricing.ts): mirror the same bounded price + cost math for display/estimates, with stable softplus/sigmoid.
- [src/server/trpc/routers/market.ts](src/server/trpc/routers/market.ts): ensure market mapping uses new helper for prices and document bounds where used.
- [supabase/DB_CONTEXT.md](supabase/DB_CONTEXT.md): if schema changes are required for migration (e.g., new market-level AMM params), update docs after migration is applied.

## Implementation details (math)

- Define bounded price:
- `p(s) = a + (b-a) * sigmoid((k*s)/B)` with `a=0.01`, `b=0.99`.
- Use cost function:
- `C(s) = a*s + (b-a)*(B/k)*softplus((k*s)/B)`.
- Use stable softplus: `softplus(x) = max(x,0) + ln(1 + exp(-|x|))`.
- Compute trade cost as `C(s+Δs) - C(s)` to preserve path independence.
- Use existing `liquidity_b` as `B` and a default `k` tuned for tail slowdown (I’ll propose a safe default like `k=0.85` unless you want explicit tuning).

## Steps

1. Add bounded sigmoid price + stable softplus helpers in `pricing.ts` and expose `calculateBoundedPriceYes`, `boundedCost` equivalents (keeping existing exports if used elsewhere).
2. Update `place_bet_tx.sql` to:

- Replace LMSR formulas with the bounded cost function and price calculation.
- Keep safeguards (clamps, numeric stability) and fee calculations unchanged.

3. Update any market price computations to use the new helper so UI and API stay consistent with settlement math.
4. Add/adjust tests or seed examples if present (optional, quick sanity check only).

## Tests / Validation

- Run `bun run build` after changes.
- Spot-check with a few trades around 1%, 50%, 99% to ensure price stays within bounds and trade costs are monotonic.