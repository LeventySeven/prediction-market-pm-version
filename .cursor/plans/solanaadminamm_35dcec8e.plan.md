---
name: SolanaAdminAmm
overview: Move admin-only flows from VCOIN to USDC with on-chain AMM state transitions + PDA escrow (non-custodial). Supabase provides quotes/indexing, but the program enforces pricing bounds and settlement on-chain. Non-admins remain on VCOIN during testing.
todos:
  - id: anchor-escrow
    content: Refactor Anchor program to PDA escrow only (deposit/withdraw/fee)
    status: pending
  - id: server-finalize
    content: Add prepare/finalize endpoints for admin flows
    status: completed
  - id: sql-offchain
    content: Adjust SQL to accept on-chain results
    status: completed
  - id: frontend-admin
    content: Wire admin UI to sign + finalize onchain txs
    status: completed
  - id: docs
    content: Update Solana setup and DB context docs
    status: completed
isProject: false
---

# Solana Admin AMM + Hybrid PDA Escrow Plan

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

- If `isAdmin`, all USDC flows require a Solana devnet wallet signature (buy/sell/claim).
- Program owns the AMM state and positions on-chain and enforces pricing bounds (`max_cost`, `min_payout`) before moving funds.
- Supabase remains for quotes, analytics, and indexing, but is not a security authority.
- Funds are non-custodial: held in user wallets or program-controlled PDA vaults only.
- Non-admins continue to use the VCOIN flow until the admin-only USDC path is validated.

## Plan

1. **Refactor Anchor program to on-chain AMM + PDA escrow**

   - Store AMM state and positions on-chain (`Market` + `Position` PDAs).
   - Use PDA vault per market for USDC custody; program signs withdrawals with PDA authority.
   - Implement `buy`, `sell`, `resolve`, `claim` with bounds (`max_cost`, `min_payout`) to reject bad quotes.
   - Emit Anchor events for off-chain reconciliation/indexing.
   - Files: [anchor/programs/prediction_market_vault/src/lib.rs](anchor/programs/prediction_market_vault/src/lib.rs)

2. **Align PDA helpers and instruction encoding**

   - Update PDA derivations for market/position/vault/authority.
   - Update server-side instruction building to use `buy/sell/claim/resolve` with bounds.
   - Files: [lib/solana/pdas.ts](lib/solana/pdas.ts), [src/server/trpc/routers/market.ts](src/server/trpc/routers/market.ts)

3. **Add “finalize” endpoints for off-chain indexing**

   - Add `finalizeBet`, `finalizeSell`, and `finalizeClaim` TRPC mutations that accept a Solana signature, verify it, and then update Supabase projections.
   - Supabase mirrors on-chain state for UI/analytics only.
   - Files: [src/server/trpc/routers/market.ts](src/server/trpc/routers/market.ts)

4. **Adjust SQL functions for quotes only**

   - Keep bounded cost helpers in Supabase for **quotes** only.
   - Add/extend functions for indexing confirmed on-chain events into trades/positions/candles.
   - Files: [db/functions/place_bet_tx.sql](db/functions/place_bet_tx.sql)

5. **Wire frontend admin flows to sign + finalize**

   - For admin trades, replace current flow with: quote → sign tx → confirm → finalize → refresh.
   - Implement admin sell + claim with on-chain `sell/claim` and finalize in Supabase.
   - Files: [app/page.tsx](app/page.tsx), [components/MarketPage.tsx](components/MarketPage.tsx)

6. **Docs + configuration alignment with Solana guidance**

   - Update `SOLANA_SETUP.md` to describe the PDA escrow + off-chain AMM split and how to deploy/initialize the program for devnet.
   - Update `supabase/DB_CONTEXT.md` to reflect the new on-chain/off-chain responsibility boundaries.
   - Files: [SOLANA_SETUP.md](SOLANA_SETUP.md), [supabase/DB_CONTEXT.md](supabase/DB_CONTEXT.md)

## Test Plan

- Admin user on devnet: quote → buy (USDC) → finalize mirrors trades/positions/market.
- Admin user: sell → finalize mirrors updates.
- Admin user: resolve → claim winnings → finalize mirrors updates.
- Non-admin users: continue to use off-chain VCOIN flow without Solana wallet requirement.