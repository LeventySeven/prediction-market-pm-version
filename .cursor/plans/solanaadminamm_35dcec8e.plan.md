---
name: SolanaAdminAmm
overview: Migrate admin-only flows from VCOIN to Solana devnet with on-chain AMM state updates, while keeping all finances and UI fully off-chain and requiring wallet signatures for every admin transaction.
todos:
  - id: anchor-amm
    content: Refactor Anchor program for on-chain AMM math only
    status: pending
  - id: server-finalize
    content: Add prepare/finalize endpoints for admin flows
    status: pending
  - id: sql-offchain
    content: Adjust SQL to accept on-chain results
    status: pending
  - id: frontend-admin
    content: Wire admin UI to sign + finalize onchain txs
    status: pending
  - id: docs
    content: Update Solana setup and DB context docs
    status: pending
isProject: false
---

# Solana Admin AMM + Off-chain Finance Plan

## Current State (Key Anchors)

- On-chain bet preparation exists only for admin USDC and signs a `place_bet` instruction with a quote authority; sell/claim are disabled in the API and UI.
```705:849:src/server/trpc/routers/market.ts
  // On-chain transaction preparation endpoints
  prepareBet: publicProcedure
    ...
      if (!authUser.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_ONLY_ONCHAIN" });
      }
      ...
      const ix = new TransactionInstruction({
        programId,
        keys: [
          { pubkey: userKey, isSigner: true, isWritable: true },
          { pubkey: quoteAuthority.publicKey, isSigner: true, isWritable: false },
          ...
        ],
        data: encodePlaceBetIxData(outcome, collateralMinor, sharesMinor),
      });
```

- The Anchor program currently keeps user vault balances on-chain and relies on off-chain quotes for pricing; it does not implement the AMM cost function on-chain.
```353:421:anchor/programs/prediction_market_vault/src/lib.rs
    /// Place a bet (buy shares). Pricing is enforced off-chain by requiring the backend quote authority to co-sign.
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        outcome: u8,
        collateral_minor: u64,
        shares_minor: u64,
    ) -> Result<()> {
        ...
        let uv = &mut ctx.accounts.user_vault;
        require!(uv.balance >= collateral_minor, VaultError::InsufficientBalance);
        uv.balance = uv.balance.saturating_sub(collateral_minor);
        ...
        ctx.accounts.market.pool_yes = ctx.accounts.market.pool_yes.saturating_add(shares_minor);
```


## Target Behavior

- If `isAdmin`, all transaction flows require a Solana devnet wallet signature for buy/sell/claim.
- AMM state updates happen on-chain, but pricing math is computed off-chain for speed/flexibility and encoded into signed transactions.
- All finances (USDC transfers, balances, fees, payouts) are off-chain; on-chain state is limited to AMM position state only.
- Off-chain tables remain the source of truth for balances; on-chain events are used for reconciliation.
- Non-admins keep the existing VCOIN flow until the full rollout.

## Plan

1. **Refactor Anchor program to AMM-only state**

   - Update `Market` account to store AMM state (`q_yes`, `q_no`, `b`, and optional `last_price_yes`) and use it for pricing.
   - Keep bounded cost function math off-chain; the program accepts `shares_minor`, `price_before/after`, and `collateral_minor` as inputs signed by a `quote_authority`.
   - Remove USDC transfers from the program; do not read or modify any on-chain token accounts.
   - Emit Anchor events with computed shares/payout and updated AMM state for off-chain reconciliation.
   - Files: [anchor/programs/prediction_market_vault/src/lib.rs](anchor/programs/prediction_market_vault/src/lib.rs)

2. **Align PDA helpers and instruction encoding**

   - Update client-side PDA derivations if account layouts or seeds change (e.g., market account now includes `b`).
   - Update instruction data encoding in the server to match new Anchor instruction args (remove `shares_minor` input; let program compute it).
   - Files: [lib/solana/pdas.ts](lib/solana/pdas.ts), [src/server/trpc/routers/market.ts](src/server/trpc/routers/market.ts)

3. **Add “finalize” endpoints for off-chain settlement**

   - Add `finalizeBet`, `finalizeSell`, and `finalizeClaim` TRPC mutations that accept a Solana signature, fetch the confirmed transaction, parse Anchor events, and apply off-chain balance updates.
   - Use those events to update `wallet_balances`, `positions`, `trades`, and market snapshots without re-running AMM math off-chain.
   - Files: [src/server/trpc/routers/market.ts](src/server/trpc/routers/market.ts)

4. **Adjust SQL functions for “precomputed AMM” flows**

   - Extend `place_bet_tx` / `sell_position_tx` or add new functions that accept precomputed `shares`, `price_before/after`, and collateral/payout from on-chain events to avoid recalculating AMM off-chain.
   - Add a `claim_winnings_tx` function to record on-chain claim events (payout + share burn) in Supabase.
   - Files: [db/functions/place_bet_tx.sql](db/functions/place_bet_tx.sql)

5. **Wire frontend admin flows to sign + finalize**

   - For admin trades, replace the current inline success path with: prepare tx → sign/confirm → call finalize endpoint → refresh UI from Supabase.
   - Implement on-chain admin sell and claim flows (remove `SOLANA_ONCHAIN_TEMP_DISABLED` guard).
   - Files: [app/page.tsx](app/page.tsx), [components/MarketPage.tsx](components/MarketPage.tsx)

6. **Docs + configuration alignment with Solana guidance**

   - Update `SOLANA_SETUP.md` to describe the AMM-on-chain/off-chain-finance split and how to deploy/initialize the program for devnet.
   - Update `supabase/DB_CONTEXT.md` to reflect the new on-chain/off-chain responsibility boundaries.
   - Files: [SOLANA_SETUP.md](SOLANA_SETUP.md), [supabase/DB_CONTEXT.md](supabase/DB_CONTEXT.md)

## Test Plan

- Admin user on devnet: place bet → wallet signature → finalize mirrors trades/positions/market.
- Admin user: sell position → wallet signature → finalize mirrors updates.
- Admin user: claim winnings after resolution → wallet signature → finalize mirrors updates.
- Non-admin users: continue to use off-chain VCOIN flow without Solana wallet requirement.