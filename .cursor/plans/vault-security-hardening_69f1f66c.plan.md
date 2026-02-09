---
name: vault-security-hardening
overview: Address the requested security fixes and enhancements in the Solana program, including ATA handling, solvency tracking, duplicate account checks, decimal validation, transfer_checked, event timestamps, close instructions, and per-user rate limiting for market creation.
todos: []
isProject: false
---

# Prediction Market Vault Fixes Plan

## Goals

- Implement the agreed security fixes and enhancements without breaking existing accounts where possible.
- Add per-user market creation rate limiting (10 minutes) via a new PDA.
- Defer oracle/quote authority centralization work for later.

## Key files

- [/Users/seventyleven/Projects/prediction-market-ru /prediction-market-ru/anchor/programs/prediction_market_vault/src/lib.rs](/Users/seventyleven/Projects/prediction-market-ru%20/prediction-market-ru/anchor/programs/prediction_market_vault/src/lib.rs)

## Planned changes

- **Account layout updates**
  - Add `total_claimed` to `Market` for solvency accounting.
  - Add a new `UserMarketCreation` (or similarly named) PDA with `last_created_ts` and `bump` to track per-user rate limiting.
- **ATA initialization hardening**
  - Replace `init_if_needed` for market/user vault ATAs with `mut`+`associated_token` constraints where safe, and document that clients must create ATAs ahead of time.
  - Keep `init_if_needed` only where explicitly desired (e.g., fee recipient ATA) or replace with preflight creation based on product decision.
- **Decimals validation + transfer_checked**
  - Validate `usdc_mint.decimals == 6` in `initialize_config`.
  - Replace `token::transfer` with `token::transfer_checked` in all USDC transfers and pass `6` as decimals.
- **Solvency protection in `collect_fees**`
  - Track `total_claimed` in `claim_winnings`.
  - Compute remaining winner liability and cap fee withdrawals accordingly.
- **Duplicate mutable account checks**
  - Add constraints ensuring `user_usdc_ata != market_vault_ata` (and similar in legacy flows) to prevent same-account reuse.
- **Event enhancements**
  - Add `timestamp: i64` fields to relevant events and populate with `Clock::get()?.unix_timestamp`.
- **Close instructions**
  - Add `close_position` (and optionally `close_market`) with proper constraints and `close = user`/`authority` to reclaim rent.
- **Rate limiting on market creation**
  - Add a `UserMarketCreation` PDA seeded by `["market_creation", user]`.
  - Update `create_market` to require `Clock::get()?.unix_timestamp - last_created_ts >= 600` and update timestamp on success.

## Notes

- We will **not** change pricing logic or add user-level restrictions beyond rate limiting, per your request.
- Oracle/quote authority centralization changes will be postponed.

## Proposed tasks

- add-solvency-tracking
- enforce-ata-and-decimals
- add-rate-limit-pda
- add-events-and-close-instructions
- integrate-transfer-checked-and-constraints

