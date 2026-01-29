#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use spl_associated_token_account::get_associated_token_address;

declare_id!("HGDLzy31GLgckzH2hHeTKaYsxDCuCoAXDtUDsJvpZ1JY");

// ============================================================================
// Accounts
// ============================================================================

#[account]
pub struct Config {
    pub authority: Pubkey,
    /// Off-chain quote/bet authority (backend) that co-signs bet/sell txs.
    pub quote_authority: Pubkey,
    /// Configured USDC mint (devnet: custom mint, mainnet: official).
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

impl Config {
    pub const SEED: &'static [u8] = b"config";
    pub const LEN: usize = 32 + 32 + 32 + 1;
}

#[account]
pub struct UserVault {
    pub user: Pubkey,
    /// Internal vault balance in minor units (USDC has 6 decimals).
    pub balance: u64,
    pub bump: u8,
}

impl UserVault {
    pub const SEED: &'static [u8] = b"user_vault";
    pub const LEN: usize = 32 + 8 + 1;
}

#[account]
pub struct Market {
    /// 16 raw UUID bytes from Supabase market id.
    pub uuid: [u8; 16],
    /// 0=open/unresolved, 1=YES, 2=NO, 3=cancelled
    pub outcome: u8,
    /// Total YES shares (scaled by 1e6)
    pub q_yes: u64,
    /// Total NO shares (scaled by 1e6)
    pub q_no: u64,
    /// Liquidity parameter b (scaled by 1e6)
    pub b: u64,
    pub bump: u8,
}

impl Market {
    pub const SEED: &'static [u8] = b"market";
    pub const LEN: usize = 16 + 1 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Position {
    pub market: Pubkey,
    pub user: Pubkey,
    pub shares_yes: u64,
    pub shares_no: u64,
    pub bump: u8,
}

impl Position {
    pub const SEED: &'static [u8] = b"position";
    pub const LEN: usize = 32 + 32 + 8 + 8 + 1;
}

// ============================================================================
// Events (indexer-friendly)
// ============================================================================

#[event]
pub struct Deposited {
    pub user: Pubkey,
    pub amount_minor: u64,
    pub new_balance_minor: u64,
}

#[event]
pub struct Withdrawn {
    pub user: Pubkey,
    pub amount_minor: u64,
    pub new_balance_minor: u64,
}

#[event]
pub struct BetPlaced {
    pub user: Pubkey,
    pub market: Pubkey,
    /// 1=YES, 2=NO
    pub outcome: u8,
    pub collateral_minor: u64,
    pub shares_minor: u64,
}

#[event]
pub struct PositionSold {
    pub user: Pubkey,
    pub market: Pubkey,
    /// 1=YES, 2=NO
    pub outcome: u8,
    pub shares_minor: u64,
    pub payout_minor: u64,
}

#[event]
pub struct WinningsClaimed {
    pub user: Pubkey,
    pub market: Pubkey,
    /// 1=YES, 2=NO
    pub outcome: u8,
    pub shares_minor: u64,
    pub payout_minor: u64,
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    /// 1=YES, 2=NO, 3=cancelled
    pub outcome: u8,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum VaultError {
    #[msg("Not authorized")]
    NotAuthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Invalid outcome")]
    InvalidOutcome,
    #[msg("Market not open")]
    MarketNotOpen,
    #[msg("Market not resolved")]
    MarketNotResolved,
    #[msg("No winning position")]
    NoWinningPosition,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Mint mismatch")]
    MintMismatch,
    #[msg("Invalid associated token account")]
    InvalidAta,
    #[msg("Missing associated token account")]
    MissingAta,
    #[msg("Invalid program id")]
    InvalidProgram,
}

// ============================================================================
// Program
// ============================================================================

#[program]
pub mod prediction_market_vault {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        quote_authority: Pubkey,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.quote_authority = quote_authority;
        cfg.usdc_mint = ctx.accounts.usdc_mint.key();
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn create_market(ctx: Context<CreateMarket>, market_uuid: [u8; 16]) -> Result<()> {
        let m = &mut ctx.accounts.market;
        m.uuid = market_uuid;
        m.outcome = 0;
        m.q_yes = 0;
        m.q_no = 0;
        m.b = 0;
        m.bump = ctx.bumps.market;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount_minor: u64) -> Result<()> {
        require!(amount_minor > 0, VaultError::InvalidAmount);
        require!(
            ctx.accounts.usdc_mint.key() == ctx.accounts.config.usdc_mint,
            VaultError::MintMismatch
        );

        require_keys_eq!(
            ctx.accounts.token_program.key(),
            spl_token::id(),
            VaultError::InvalidProgram
        );
        require_keys_eq!(
            ctx.accounts.associated_token_program.key(),
            spl_associated_token_account::id(),
            VaultError::InvalidProgram
        );

        let usdc_mint_key = ctx.accounts.usdc_mint.key();
        let user_expected_ata =
            get_associated_token_address(&ctx.accounts.user.key(), &usdc_mint_key);
        let vault_expected_ata =
            get_associated_token_address(&ctx.accounts.config.key(), &usdc_mint_key);

        require_keys_eq!(
            ctx.accounts.user_usdc_ata.key(),
            user_expected_ata,
            VaultError::InvalidAta
        );
        require_keys_eq!(
            ctx.accounts.vault_usdc_ata.key(),
            vault_expected_ata,
            VaultError::InvalidAta
        );

        require!(
            !ctx.accounts.user_usdc_ata.to_account_info().data_is_empty(),
            VaultError::MissingAta
        );

        // Create vault ATA if missing.
        if ctx.accounts.vault_usdc_ata.to_account_info().data_is_empty() {
            let ix = spl_associated_token_account::instruction::create_associated_token_account(
                &ctx.accounts.user.key(),
                &ctx.accounts.config.key(),
                &usdc_mint_key,
                &spl_token::id(),
            );
            invoke(
                &ix,
                &[
                    ctx.accounts.user.to_account_info(),
                    ctx.accounts.vault_usdc_ata.to_account_info(),
                    ctx.accounts.config.to_account_info(),
                    ctx.accounts.usdc_mint.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                    ctx.accounts.token_program.to_account_info(),
                ],
            )?;
        }

        // Transfer from user -> vault ATA (owned by config PDA).
        let ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &ctx.accounts.user_usdc_ata.key(),
            &ctx.accounts.vault_usdc_ata.key(),
            &ctx.accounts.user.key(),
            &[],
            amount_minor,
        )?;
        invoke(
            &ix,
            &[
                ctx.accounts.user_usdc_ata.to_account_info(),
                ctx.accounts.vault_usdc_ata.to_account_info(),
                ctx.accounts.user.to_account_info(),
            ],
        )?;

        let uv = &mut ctx.accounts.user_vault;
        uv.user = ctx.accounts.user.key();
        uv.bump = ctx.bumps.user_vault;
        uv.balance = uv.balance.saturating_add(amount_minor);

        emit!(Deposited {
            user: ctx.accounts.user.key(),
            amount_minor,
            new_balance_minor: uv.balance,
        });
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount_minor: u64) -> Result<()> {
        require!(amount_minor > 0, VaultError::InvalidAmount);
        require!(
            ctx.accounts.usdc_mint.key() == ctx.accounts.config.usdc_mint,
            VaultError::MintMismatch
        );

        require_keys_eq!(
            ctx.accounts.token_program.key(),
            spl_token::id(),
            VaultError::InvalidProgram
        );

        let usdc_mint_key = ctx.accounts.usdc_mint.key();
        let user_expected_ata =
            get_associated_token_address(&ctx.accounts.user.key(), &usdc_mint_key);
        let vault_expected_ata =
            get_associated_token_address(&ctx.accounts.config.key(), &usdc_mint_key);

        require_keys_eq!(
            ctx.accounts.user_usdc_ata.key(),
            user_expected_ata,
            VaultError::InvalidAta
        );
        require_keys_eq!(
            ctx.accounts.vault_usdc_ata.key(),
            vault_expected_ata,
            VaultError::InvalidAta
        );
        require!(
            !ctx.accounts.user_usdc_ata.to_account_info().data_is_empty(),
            VaultError::MissingAta
        );
        require!(
            !ctx.accounts.vault_usdc_ata.to_account_info().data_is_empty(),
            VaultError::MissingAta
        );

        let uv = &mut ctx.accounts.user_vault;
        require!(uv.balance >= amount_minor, VaultError::InsufficientBalance);
        uv.balance = uv.balance.saturating_sub(amount_minor);

        // Transfer from vault ATA (owned by config PDA) -> user ATA.
        let signer_seeds: &[&[&[u8]]] = &[&[Config::SEED, &[ctx.accounts.config.bump]]];

        let ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &ctx.accounts.vault_usdc_ata.key(),
            &ctx.accounts.user_usdc_ata.key(),
            &ctx.accounts.config.key(),
            &[],
            amount_minor,
        )?;
        invoke_signed(
            &ix,
            &[
                ctx.accounts.vault_usdc_ata.to_account_info(),
                ctx.accounts.user_usdc_ata.to_account_info(),
                ctx.accounts.config.to_account_info(),
            ],
            signer_seeds,
        )?;

        emit!(Withdrawn {
            user: ctx.accounts.user.key(),
            amount_minor,
            new_balance_minor: uv.balance,
        });
        Ok(())
    }

    /// Place a bet (buy shares). Pricing is enforced off-chain; on-chain enforces bounds + custody.
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        outcome: u8,          // 1=YES, 2=NO
        collateral_minor: u64,
        shares_minor: u64,    // scaled by 1e6
        max_cost_minor: u64,
    ) -> Result<()> {
        require!(outcome == 1 || outcome == 2, VaultError::InvalidOutcome);
        require!(collateral_minor > 0 && shares_minor > 0, VaultError::InvalidAmount);
        require!(collateral_minor <= max_cost_minor, VaultError::InvalidAmount);
        require!(ctx.accounts.market.outcome == 0, VaultError::MarketNotOpen);
        require!(
            ctx.accounts.quote_authority.key() == ctx.accounts.config.quote_authority,
            VaultError::NotAuthorized
        );

        let pos = &mut ctx.accounts.position;
        pos.market = ctx.accounts.market.key();
        pos.user = ctx.accounts.user.key();
        pos.bump = ctx.bumps.position;
        if outcome == 1 {
            pos.shares_yes = pos.shares_yes.saturating_add(shares_minor);
            ctx.accounts.market.q_yes = ctx.accounts.market.q_yes.saturating_add(shares_minor);
        } else {
            pos.shares_no = pos.shares_no.saturating_add(shares_minor);
            ctx.accounts.market.q_no = ctx.accounts.market.q_no.saturating_add(shares_minor);
        }

        // Ensure USDC mint matches config.
        require!(
            ctx.accounts.usdc_mint.key() == ctx.accounts.config.usdc_mint,
            VaultError::MintMismatch
        );

        require_keys_eq!(
            ctx.accounts.token_program.key(),
            spl_token::id(),
            VaultError::InvalidProgram
        );
        require_keys_eq!(
            ctx.accounts.associated_token_program.key(),
            spl_associated_token_account::id(),
            VaultError::InvalidProgram
        );

        let usdc_mint_key = ctx.accounts.usdc_mint.key();
        let user_expected_ata =
            get_associated_token_address(&ctx.accounts.user.key(), &usdc_mint_key);
        let vault_expected_ata =
            get_associated_token_address(&ctx.accounts.market.key(), &usdc_mint_key);

        require_keys_eq!(
            ctx.accounts.user_usdc_ata.key(),
            user_expected_ata,
            VaultError::InvalidAta
        );
        require_keys_eq!(
            ctx.accounts.market_vault_ata.key(),
            vault_expected_ata,
            VaultError::InvalidAta
        );

        require!(
            !ctx.accounts.user_usdc_ata.to_account_info().data_is_empty(),
            VaultError::MissingAta
        );

        // Create market vault ATA if missing.
        if ctx.accounts.market_vault_ata.to_account_info().data_is_empty() {
            let ix = spl_associated_token_account::instruction::create_associated_token_account(
                &ctx.accounts.user.key(),
                &ctx.accounts.market.key(),
                &usdc_mint_key,
                &spl_token::id(),
            );
            invoke(
                &ix,
                &[
                    ctx.accounts.user.to_account_info(),
                    ctx.accounts.market_vault_ata.to_account_info(),
                    ctx.accounts.market.to_account_info(),
                    ctx.accounts.usdc_mint.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                    ctx.accounts.token_program.to_account_info(),
                ],
            )?;
        }

        // Transfer from user -> market vault ATA (owned by market PDA).
        let ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &ctx.accounts.user_usdc_ata.key(),
            &ctx.accounts.market_vault_ata.key(),
            &ctx.accounts.user.key(),
            &[],
            collateral_minor,
        )?;
        invoke(
            &ix,
            &[
                ctx.accounts.user_usdc_ata.to_account_info(),
                ctx.accounts.market_vault_ata.to_account_info(),
                ctx.accounts.user.to_account_info(),
            ],
        )?;

        emit!(BetPlaced {
            user: ctx.accounts.user.key(),
            market: ctx.accounts.market.key(),
            outcome,
            collateral_minor,
            shares_minor,
        });
        Ok(())
    }

    /// Sell a position (cash out shares). Payout is enforced off-chain by requiring quote authority to co-sign.
    pub fn sell_position(
        ctx: Context<SellPosition>,
        outcome: u8,       // 1=YES, 2=NO
        shares_minor: u64,
        payout_minor: u64,
        min_payout_minor: u64,
    ) -> Result<()> {
        require!(outcome == 1 || outcome == 2, VaultError::InvalidOutcome);
        require!(shares_minor > 0, VaultError::InvalidAmount);
        require!(payout_minor >= min_payout_minor, VaultError::InvalidAmount);
        require!(ctx.accounts.market.outcome == 0, VaultError::MarketNotOpen);
        require!(
            ctx.accounts.quote_authority.key() == ctx.accounts.config.quote_authority,
            VaultError::NotAuthorized
        );

        let pos = &mut ctx.accounts.position;
        if outcome == 1 {
            require!(pos.shares_yes >= shares_minor, VaultError::InsufficientShares);
            pos.shares_yes = pos.shares_yes.saturating_sub(shares_minor);
            ctx.accounts.market.q_yes = ctx.accounts.market.q_yes.saturating_sub(shares_minor);
        } else {
            require!(pos.shares_no >= shares_minor, VaultError::InsufficientShares);
            pos.shares_no = pos.shares_no.saturating_sub(shares_minor);
            ctx.accounts.market.q_no = ctx.accounts.market.q_no.saturating_sub(shares_minor);
        }

        require!(
            ctx.accounts.usdc_mint.key() == ctx.accounts.config.usdc_mint,
            VaultError::MintMismatch
        );
        require_keys_eq!(
            ctx.accounts.token_program.key(),
            spl_token::id(),
            VaultError::InvalidProgram
        );

        let usdc_mint_key = ctx.accounts.usdc_mint.key();
        let user_expected_ata =
            get_associated_token_address(&ctx.accounts.user.key(), &usdc_mint_key);
        let vault_expected_ata =
            get_associated_token_address(&ctx.accounts.market.key(), &usdc_mint_key);

        require_keys_eq!(
            ctx.accounts.user_usdc_ata.key(),
            user_expected_ata,
            VaultError::InvalidAta
        );
        require_keys_eq!(
            ctx.accounts.market_vault_ata.key(),
            vault_expected_ata,
            VaultError::InvalidAta
        );
        require!(
            !ctx.accounts.market_vault_ata.to_account_info().data_is_empty(),
            VaultError::MissingAta
        );

        // Transfer from market vault ATA -> user ATA (market PDA signs).
        let signer_seeds: &[&[&[u8]]] = &[&[
            Market::SEED,
            ctx.accounts.market.uuid.as_ref(),
            &[ctx.accounts.market.bump],
        ]];
        let ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &ctx.accounts.market_vault_ata.key(),
            &ctx.accounts.user_usdc_ata.key(),
            &ctx.accounts.market.key(),
            &[],
            payout_minor,
        )?;
        invoke_signed(
            &ix,
            &[
                ctx.accounts.market_vault_ata.to_account_info(),
                ctx.accounts.user_usdc_ata.to_account_info(),
                ctx.accounts.market.to_account_info(),
            ],
            signer_seeds,
        )?;

        emit!(PositionSold {
            user: ctx.accounts.user.key(),
            market: ctx.accounts.market.key(),
            outcome,
            shares_minor,
            payout_minor,
        });
        Ok(())
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>, outcome: u8) -> Result<()> {
        require!(outcome == 1 || outcome == 2 || outcome == 3, VaultError::InvalidOutcome);
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            VaultError::NotAuthorized
        );
        require!(ctx.accounts.market.outcome == 0, VaultError::MarketNotOpen);
        ctx.accounts.market.outcome = outcome;
        emit!(MarketResolved {
            market: ctx.accounts.market.key(),
            outcome,
        });
        Ok(())
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>, min_payout_minor: u64) -> Result<()> {
        let outcome = ctx.accounts.market.outcome;
        require!(outcome == 1 || outcome == 2, VaultError::MarketNotResolved);

        let pos = &mut ctx.accounts.position;
        let shares_minor = if outcome == 1 {
            let s = pos.shares_yes;
            require!(s > 0, VaultError::NoWinningPosition);
            pos.shares_yes = 0;
            s
        } else {
            let s = pos.shares_no;
            require!(s > 0, VaultError::NoWinningPosition);
            pos.shares_no = 0;
            s
        };
        let payout_minor = shares_minor;
        require!(payout_minor >= min_payout_minor, VaultError::InvalidAmount);

        require!(
            ctx.accounts.usdc_mint.key() == ctx.accounts.config.usdc_mint,
            VaultError::MintMismatch
        );
        require_keys_eq!(
            ctx.accounts.token_program.key(),
            spl_token::id(),
            VaultError::InvalidProgram
        );

        let usdc_mint_key = ctx.accounts.usdc_mint.key();
        let user_expected_ata =
            get_associated_token_address(&ctx.accounts.user.key(), &usdc_mint_key);
        let vault_expected_ata =
            get_associated_token_address(&ctx.accounts.market.key(), &usdc_mint_key);

        require_keys_eq!(
            ctx.accounts.user_usdc_ata.key(),
            user_expected_ata,
            VaultError::InvalidAta
        );
        require_keys_eq!(
            ctx.accounts.market_vault_ata.key(),
            vault_expected_ata,
            VaultError::InvalidAta
        );
        require!(
            !ctx.accounts.market_vault_ata.to_account_info().data_is_empty(),
            VaultError::MissingAta
        );

        // Transfer from market vault ATA -> user ATA (market PDA signs).
        let signer_seeds: &[&[&[u8]]] = &[&[
            Market::SEED,
            ctx.accounts.market.uuid.as_ref(),
            &[ctx.accounts.market.bump],
        ]];
        let ix = spl_token::instruction::transfer(
            &spl_token::id(),
            &ctx.accounts.market_vault_ata.key(),
            &ctx.accounts.user_usdc_ata.key(),
            &ctx.accounts.market.key(),
            &[],
            payout_minor,
        )?;
        invoke_signed(
            &ix,
            &[
                ctx.accounts.market_vault_ata.to_account_info(),
                ctx.accounts.user_usdc_ata.to_account_info(),
                ctx.accounts.market.to_account_info(),
            ],
            signer_seeds,
        )?;

        emit!(WinningsClaimed {
            user: ctx.accounts.user.key(),
            market: ctx.accounts.market.key(),
            outcome,
            shares_minor,
            payout_minor,
        });
        Ok(())
    }
}

// ============================================================================
// Instruction contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::LEN,
        seeds = [Config::SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: stored as a Pubkey in Config; checked by comparing pubkeys in instructions.
    pub usdc_mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_uuid: [u8; 16])]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Market::LEN,
        seeds = [Market::SEED, market_uuid.as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: validated by comparing pubkeys against config.usdc_mint.
    pub usdc_mint: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserVault::LEN,
        seeds = [UserVault::SEED, user.key().as_ref()],
        bump
    )]
    pub user_vault: Account<'info, UserVault>,

    /// CHECK: validated to be the user's USDC ATA (derived address).
    #[account(mut)]
    pub user_usdc_ata: UncheckedAccount<'info>,

    /// CHECK: validated to be the config PDA's USDC ATA (derived address); created if missing.
    #[account(mut)]
    pub vault_usdc_ata: UncheckedAccount<'info>,

    /// CHECK: validated against `spl_token::id()`.
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: validated against `spl_associated_token_account::id()`.
    pub associated_token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: validated by comparing pubkeys against config.usdc_mint.
    pub usdc_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [UserVault::SEED, user.key().as_ref()],
        bump = user_vault.bump,
        constraint = user_vault.user == user.key()
    )]
    pub user_vault: Account<'info, UserVault>,

    /// CHECK: validated to be the user's USDC ATA (derived address).
    #[account(mut)]
    pub user_usdc_ata: UncheckedAccount<'info>,

    /// CHECK: validated to be the config PDA's USDC ATA (derived address).
    #[account(mut)]
    pub vault_usdc_ata: UncheckedAccount<'info>,

    /// CHECK: validated against `spl_token::id()`.
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// Off-chain pricing authority that must co-sign bet/sell.
    pub quote_authority: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [Market::SEED, market.uuid.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Position::LEN,
        seeds = [Position::SEED, market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    /// CHECK: validated by comparing pubkeys against config.usdc_mint.
    pub usdc_mint: UncheckedAccount<'info>,

    /// CHECK: user's USDC ATA.
    #[account(mut)]
    pub user_usdc_ata: UncheckedAccount<'info>,

    /// CHECK: market PDA USDC ATA.
    #[account(mut)]
    pub market_vault_ata: UncheckedAccount<'info>,

    /// CHECK: validated against `spl_token::id()`.
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: validated against `spl_associated_token_account::id()`.
    pub associated_token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SellPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub quote_authority: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [Market::SEED, market.uuid.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [Position::SEED, market.key().as_ref(), user.key().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,

    /// CHECK: validated by comparing pubkeys against config.usdc_mint.
    pub usdc_mint: UncheckedAccount<'info>,

    /// CHECK: user's USDC ATA.
    #[account(mut)]
    pub user_usdc_ata: UncheckedAccount<'info>,

    /// CHECK: market PDA USDC ATA.
    #[account(mut)]
    pub market_vault_ata: UncheckedAccount<'info>,

    /// CHECK: validated against `spl_token::id()`.
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [Market::SEED, market.uuid.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [Market::SEED, market.uuid.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [Position::SEED, market.key().as_ref(), user.key().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,

    /// CHECK: validated by comparing pubkeys against config.usdc_mint.
    pub usdc_mint: UncheckedAccount<'info>,

    /// CHECK: user's USDC ATA.
    #[account(mut)]
    pub user_usdc_ata: UncheckedAccount<'info>,

    /// CHECK: market PDA USDC ATA.
    #[account(mut)]
    pub market_vault_ata: UncheckedAccount<'info>,

    /// CHECK: validated against `spl_token::id()`.
    pub token_program: UncheckedAccount<'info>,
}

