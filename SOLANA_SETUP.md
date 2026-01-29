# Solana Migration Setup Guide

This guide covers the environment variables and setup steps needed for the Solana migration.

## Environment Variables

Add these to your `.env.local` or `.env` file:

### Required (Frontend)

```bash
# Solana cluster (devnet, testnet, or mainnet-beta)
NEXT_PUBLIC_SOLANA_CLUSTER=devnet

# Optional: Custom RPC endpoint (defaults to Solana's public RPC if not set)
# For devnet, you can use: https://api.devnet.solana.com
# For mainnet, consider using a dedicated RPC provider like Helius, QuickNode, etc.
NEXT_PUBLIC_SOLANA_RPC_URL=

# Solana program ID (required once Anchor program is deployed)
# This will be generated when you deploy the Anchor program
NEXT_PUBLIC_SOLANA_PROGRAM_ID=

# USDC mint address (required once USDC mint is created/deployed)
# For devnet, you'll create a test USDC mint
# For mainnet-beta, use official USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
NEXT_PUBLIC_SOLANA_USDC_MINT=
```

### Optional (Backend/Webhooks)

```bash
# Backend can also use these (without NEXT_PUBLIC_ prefix)
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=
SOLANA_PROGRAM_ID=
SOLANA_USDC_MINT=

# Helius webhook secret (for secure webhook verification)
# Generate a random secret and configure it in your Helius dashboard
HELIUS_WEBHOOK_SECRET=your-random-secret-here
```

### Existing (Should Already Be Set)

```bash
# Supabase (required for database)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Setup Steps

### 1. Apply Database Migration

The Solana migration adds new columns and removes EVM columns. Apply it:

```bash
# If using Supabase CLI locally
supabase migration up

# Or apply directly to your production/staging database via Supabase dashboard
# Navigate to: Database → Migrations → Run migration: 20260117000000_solana_wallet_and_onchain_fields.sql
```

### 2. Install Prerequisites

Anchor requires Rust and Solana CLI to build programs.

**Install Rust (Required):**

```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Reload your shell or run:
source ~/.cargo/env

# Update to latest stable version (important for Anchor 0.32.1)
rustup update stable

# Verify installation (should be 1.85+ for edition2024 support)
rustc --version
cargo --version
```

**Note:** If you get `edition2024` errors, your Rust/Cargo version is too old. Update with:
```bash
rustup update stable
rustup default stable
```

**Install Solana CLI and Platform Tools (Required):**

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Reload shell or run:
source ~/.zshrc  # or source ~/.bash_profile

# Install Solana platform tools (includes cargo-build-sbf)
solana-install init

# Verify installation
solana --version
solana config set --url devnet  # Set devnet as default

# Verify build tools are available
cargo-build-sbf --version  # Should show version if installed correctly
```

**If `cargo-build-sbf` is still not found after installing Solana:**

```bash
# Install cargo-build-sbf directly via cargo
cargo install cargo-build-sbf

# Or install via Solana's platform tools
solana-install init
```

**Install Anchor CLI (Version Alignment Critical):**

**Important:** Anchor version must match your Solana platform tools. The project uses **Anchor 0.30.1** to be compatible with platform-tools v1.51 (Cargo 1.84.0).

**Option A: Install Anchor 0.30.1 via AVM (Recommended):**

**Important:** If you have Anchor installed via Homebrew, uninstall it first and add AVM to PATH:

```bash
# 1. Uninstall Homebrew Anchor (if installed)
brew uninstall anchor

# 2. Install AVM (Anchor Version Manager)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# 3. Add AVM to PATH (add to ~/.zshrc or ~/.bash_profile)
export PATH="$HOME/.avm/bin:$PATH"

# Reload shell or run:
source ~/.zshrc  # or source ~/.bash_profile

# 4. Verify AVM is accessible
avm --version

# 5. Install Anchor 0.30.1 (matches platform-tools v1.51)
avm install 0.30.1 --force  # --force overwrites any existing binary
avm use 0.30.1

# 6. Verify installation (should use AVM's anchor, not Homebrew's)
which anchor  # Should show ~/.avm/bin/anchor or ~/.cargo/bin/anchor
anchor --version  # Should show 0.30.1
```

**If `avm install` still fails with "binary already exists":**

```bash
# Manually remove the existing binary first
rm -f ~/.cargo/bin/anchor
rm -f ~/.avm/bin/anchor

# Then install
avm install 0.30.1 --force
avm use 0.30.1
```

**Fix Solana SDK Path (if you get SDK path errors):**

```bash
# Create symlink so cargo-build-sbf can find the SDK
mkdir -p ~/.cargo/bin/platform-tools-sdk
ln -sf ~/.local/share/solana/install/active_release/bin/platform-tools-sdk/* ~/.cargo/bin/platform-tools-sdk/

# Verify the symlink
ls -la ~/.cargo/bin/platform-tools-sdk/
```

**Option B: Use Homebrew Anchor (if 0.30.1 available):**

```bash
# Check if Homebrew has 0.30.1
brew install anchor@0.30.1

# Or install latest and use AVM to switch
brew install anchor
# Then use AVM to switch to 0.30.1
```

**Version Compatibility Check:**

After installation, verify versions are aligned:

```bash
anchor --version        # Should be 0.30.1
solana --version        # Should be 1.18.x
cargo-build-sbf --version  # Should show platform-tools v1.51
```

**Why 0.30.1?** Anchor 0.32.1 requires dependencies with `edition2024`, but platform-tools v1.51 bundles Cargo 1.84.0 which doesn't support it. Anchor 0.30.1 is compatible with the older Cargo version.

### 3. Deploy Anchor Program (When Ready)

**Important:** Make sure you're in the `anchor` directory before running Anchor commands!

```bash
cd anchor
```

**Install Anchor 0.30.1 (Required for compatibility):**

The project is configured for Anchor 0.30.1 to match platform-tools v1.51. Install it:

```bash
# If you have AVM installed:
avm install 0.30.1
avm use 0.30.1

# Verify version
anchor --version  # Should show 0.30.1

# If you don't have AVM, install it first (see Prerequisites section)
```

**Create Solana keypair:**

A keypair has been created in the `anchor/` directory. If you need to create a new one:

```bash
cd anchor

# Create project-local keypair (already done)
solana-keygen new --no-bip39-passphrase -o ./deployer-keypair.json

# The Anchor.toml is already configured to use this keypair
```

**Build and deploy:**

```bash
cd anchor

# Generate program ID keys (already done, but can re-run if needed)
anchor keys list

# Build the program
anchor build

# Deploy to devnet (requires SOL for fees - get airdrop if needed)
anchor deploy --provider.cluster devnet

# If you need devnet SOL:
solana airdrop 2 $(solana address) --url devnet

# The deploy command will output the program ID
# Update your .env with: NEXT_PUBLIC_SOLANA_PROGRAM_ID=<program-id-from-output>
```

### 4. Create USDC Mint (Devnet)

For devnet testing, create a test USDC mint:

```bash
# Use the provided script (when implemented)
bun run solana:mint:devnet

# Or manually via Solana CLI:
# solana-test-validator (in one terminal)
# spl-token create-token --decimals 6
# spl-token create-account <token-address>
# spl-token mint <token-address> <amount> <account-address>
```

Then set `NEXT_PUBLIC_SOLANA_USDC_MINT` to the mint address.

### 5. Configure Helius Webhook (Optional, for Production)

When ready for production indexing:

1. Set up a Helius account (https://helius.dev)
2. Create a webhook that listens to your program ID
3. Set the webhook URL to: `https://your-domain.com/api/webhooks/helius`
4. Configure `HELIUS_WEBHOOK_SECRET` in both Helius dashboard and your `.env`
5. The webhook will automatically reconcile on-chain transactions with your database

### 6. Run the Application

```bash
# Install dependencies (already done, but run if needed)
bun install

# Start development server
bun run dev
```

## Current Status

✅ **Completed:**
- Database schema migration (ready to apply)
- Frontend Solana Wallet Adapter integration
- Backend Solana wallet linking endpoints
- Webhook handler structure (needs Helius setup)
- EVM code cleanup

⏳ **Pending:**
- Anchor program deployment (has placeholder program ID)
- USDC mint creation (devnet)
- Helius webhook configuration
- Production-grade indexing (Helius or dedicated RPC with signature polling)

✅ **Admin-only on-chain flow (devnet):**
- `prepareBet/prepareSell/prepareClaim` build Solana transactions for admins.
- `finalizeBet/finalizeSell/finalizeClaim` confirm the on-chain tx and mirror results into Supabase.

## Testing the Wallet Connection

Once the app is running:

1. Open the app in your browser
2. Click "Connect Wallet" (Solana wallet adapter modal will appear)
3. Select Phantom, Solflare, or another Solana wallet
4. The wallet address will sync to your Supabase database automatically

## Troubleshooting

### "SOLANA_PROGRAM_NOT_DEPLOYED" Error

This indicates the Anchor program ID or deployment is missing. The admin-only on-chain endpoints require a deployed program and a devnet USDC mint.

### Wallet Not Syncing

Check that:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- The database migration has been applied
- Your Supabase RLS policies allow wallet updates (should be handled by auth)

### RPC Errors

If you're hitting rate limits on public RPC:
- Set `NEXT_PUBLIC_SOLANA_RPC_URL` to a dedicated RPC provider (Helius, QuickNode, etc.)
- Free tiers are usually sufficient for development

## Next Steps

1. **Apply the database migration** (required for wallet sync)
2. **Set basic env vars** (`NEXT_PUBLIC_SOLANA_CLUSTER=devnet`)
3. **Test wallet connection** (should work immediately)
4. **Deploy Anchor program** (required for admin on-chain flow)
5. **Create devnet USDC mint** (for testing admin buy/sell/claim)
6. **Configure Helius webhook** (for production-grade indexing)
