1. Authentication & Authorization
Why It Matters
The Wormhole exploit ($320M) occurred because the program checked a pubkey without verifying the is_signer flag. Authentication failures are the #1 cause of Solana exploits.
Security Checks
Account Data Matching (Critical)

    Stored authority matches signer — All privileged functions verify the signer's pubkey matches the stored authority
    Use Anchor constraints — Prefer constraint = config.admin == admin.key() over manual checks
    Check BEFORE state changes — Validate authority before any state modifications

Missing Signer Check (Critical)

    Always verify is_signer — Checking pubkey alone is insufficient; anyone can pass any pubkey
    Use Anchor's Signer<'info> — This type automatically verifies the signature
    Check signer before pubkey — Order matters for security clarity

Missing Ownership Check (Critical)

    Validate account owners — Ensure accounts are owned by expected programs
    Use Account<'info, T> — Anchor automatically validates ownership for typed accounts
    Check PDAs with seeds/bump — PDA ownership is implicit via seed derivation

Authority Transfer (High)

    Implement two-step transfers — Nominate → Accept pattern prevents accidental lockouts
    Validate new authority — Check it's not zero/default address
    Allow cancellation — Current authority should be able to cancel pending transfers

Insecure Initialization (Critical)

    Restrict initializers — Only program upgrade authority or hardcoded deployer
    Use PDA init constraint — Prevents re-initialization
    Verify upgrade authority — Check program_data.upgrade_authority_address

Red Flags

    Functions that only check admin.key() == expected_key without Signer<'info>
    AccountInfo<'info> or UncheckedAccount without ownership constraints
    Single-step authority transfers
    Initialization callable by anyone

2. State Management
Why It Matters
Solana's account model means state can be manipulated in ways Ethereum developers don't expect. Stale data, duplicate accounts, and improper closing all create vulnerabilities.
Security Checks
Account Data Reallocation (Medium)

    Use correct zero_init parameter — Set to true when size increases after decrease in same transaction
    Bound dynamic data sizes — Prevent unbounded growth that could exhaust rent
    Consider fixed-size accounts — Avoid reallocation complexity when possible

Account Reloading (High)

    Reload after CPI — Call .reload() on accounts modified by CPIs before reading
    Don't cache stale data — Fresh reads are safer than cached values
    Document CPI effects — Track which accounts may be modified

Closing Accounts (High)

    Zero all data on close — Prevents revival attacks with stale data
    Set CLOSED_ACCOUNT_DISCRIMINATOR — Anchor's close constraint does this
    Transfer ALL lamports — Don't leave accounts rent-exempt but empty

Duplicate Mutable Accounts (High)

    Add uniqueness constraints — constraint = account_a.key() != account_b.key()
    Use different types — Type safety prevents same account for different purposes
    Test with duplicates — Verify rejection of same account passed twice

PDA Sharing (High)

    Include user pubkey in seeds — Each user should have their own PDA
    Use distinct prefixes — Different account types need different seed prefixes
    Document isolation model — Is this PDA global or per-user?

Bump Seed Canonicalization (Medium)

    Never accept user-provided bumps — Always derive canonically
    Use Anchor's bump constraint — Automatic canonical derivation
    Store and reuse bumps — Save canonical bump in account data

Red Flags

    realloc with hardcoded zero_init = false
    Account data accessed after CPI without reload
    Accounts closed with only lamport transfer (no data zeroing)
    PDAs with only static seeds (no user differentiation)

3. Cross-Program Invocation (CPI)
Why It Matters
CPIs are powerful but dangerous. Forwarding signers to untrusted programs can result in wallet theft or ownership reassignment. The "steal the wallet" attack can permanently lock user funds.
Security Checks
Arbitrary CPI (Critical)

    Validate target program ID — Never CPI to user-supplied program without verification
    Use Program<'info, T> — Anchor validates program ID automatically
    Whitelist trusted programs — Only CPI to known, audited programs

CPI Signer Pitfalls (Critical)

    Don't forward user wallets — Use protocol PDAs as authorities instead
    Check ownership after CPI — Verify accounts weren't reassigned
    Guard lamport balances — Check balance before/after for forwarded signers

Security Dependency Chain (High)

    Validate all dependencies — If account A depends on account B, validate B
    No unconstrained sources — Every account in validation chain needs constraints
    Document dependency graphs — Map which validations depend on what

Lamport Balance Mismatch (Medium)

    Check balances after CPI — CPIs can modify lamports unexpectedly
    Account for rent — Rent-exempt minimums can cause surprises
    Use pull pattern when possible — Safer than pushing lamports

Red Flags

    invoke() with user-supplied program account
    User wallet (Signer<'info>) passed to third-party program CPIs
    Validation chains with unconstrained root accounts
    No ownership checks after CPIs that receive signers

4. Math & Precision
Why It Matters
Rust's release builds (which Solana uses) don't check for integer overflow by default. A single overflow can let attackers mint unlimited tokens or drain protocols.
Security Checks
Overflow/Underflow (Critical)

    Use checked arithmetic — checked_add, checked_sub, checked_mul, checked_div
    Enable overflow checks — Set overflow-checks = true in Cargo.toml
    Never use wrapping arithmetic for values — Only for intentional wrapping

Loss of Precision (High)

    Multiply before divide — (a * b) / c not (a / c) * b
    Round in protocol's favor — Floor for payouts, ceil for fees
    Use u128 for intermediates — Scale up to prevent intermediate overflow

Division by Zero (High)

    Check divisors — Validate non-zero before any division
    Handle empty pools — Special case when liquidity/supply is zero
    Use checked_div — Returns None instead of panicking

Casting Vulnerabilities (High)

    Use try_from for narrowing — u64::try_from(value) not value as u64
    Verify sign before casting — Check i64 >= 0 before casting to u64
    Avoid as for user input — Silent truncation is dangerous

Red Flags

    Direct arithmetic operators (+, -, *, /) on u64 values
    as casts on user-provided or calculated values
    Division without zero checks
    Multiplication after division in fee calculations

5. Token Operations
Why It Matters
Token handling requires careful validation. Wrong mints, missing authorities, and fee-on-transfer tokens all create vulnerabilities.
Security Checks
Token-Agnostic Interface (Medium)

    Use token_interface — For Token-2022 compatibility
    Use transfer_checked — Validates decimals, works with both programs
    Don't mix types — Interface<'info, TokenInterface> with token_interface::transfer_checked

Pre-created ATAs (Medium)

    Use init_if_needed — ATAs can be pre-created by anyone
    Never use init for ATAs — Attackers can front-run and DoS
    Test with existing ATAs — Verify your program handles both cases

SPL Token Validation (High)

    Validate mint — token_account.mint == expected_mint
    Validate owner/authority — token_account.owner == expected_owner
    Check for frozen accounts — Some operations fail on frozen accounts

Red Flags

    init constraint on associated token accounts
    Token transfers without mint validation
    Using token::transfer with Interface<'info, TokenInterface>

6. Token-2022 Extensions
Why It Matters
Token-2022 introduces powerful extensions that can fundamentally change token behavior. Programs that don't account for these features may be exploitable.
Security Checks
CPIGuard Extension (High)

    Handle CPI restrictions — Some accounts can't be transferred via CPI
    Check extension state — Detect if CPIGuard is enabled before CPI
    Provide fallback flows — Alternative paths for guarded accounts

Default Account State (Medium)

    Check initial frozen state — New accounts may be frozen by default
    Handle thaw requirements — May need authority to thaw before use
    Verify mint configuration — Check default_account_state extension

Mint Close Authority (High)

    Verify mint existence — Mints can be closed in Token-2022
    Check before operations — Don't assume mints are permanent
    Handle closed mint gracefully — Tokens become worthless

Permanent Delegate (Critical)

    Check for permanent delegate — They can transfer/burn from ANY account
    Warn users about risks — Deposits with permanent delegate may be reclaimed
    Consider blocking deposits — For high-security vaults

Transfer Hook (High)

    Budget extra CUs — Hooks consume compute units
    Handle hook failures — Transfers may fail due to hook logic
    Test with hook-enabled tokens — Verify your program works

Transfer Fees (High)

    Account for fees in calculations — Recipient receives less than sent
    Use transfer_checked — Automatically handles fee calculation
    Validate expected amounts — Check actual received vs expected

Red Flags

    No checks for Token-2022 extensions
    Assuming transfer amount equals received amount
    Not budgeting CUs for transfer hooks
    Accepting deposits of tokens with permanent delegates

7. Edge Cases & Pitfalls
Why It Matters
Subtle bugs and Rust syntax mistakes can cause critical vulnerabilities. These issues often pass code review but fail in production.
Security Checks
Frontrunning (High)

    Require expected values — Slippage protection for all swaps
    Use commit-reveal — For sensitive operations
    Include deadlines — Reject stale transactions

Lamport Transfer Kill Switch (Medium)

    Use pull pattern — Let users withdraw instead of pushing refunds
    Validate rent-exemption — Transfers to 0-lamport accounts can fail
    Check not executable — Can't transfer lamports to programs

Vector Length Issue (Medium)

    Use vec![value; count] — Not vec![count]
    Prefer push/extend — Safer than index assignment
    Test with various sizes — Catch out-of-bounds at test time

Type Cosplay (High)

    Validate discriminators — Anchor does this automatically for Account<'info, T>
    Don't trust raw AccountInfo — Could be any account type
    Check program ownership — Even with correct discriminator

Sysvar Address Checking (Medium)

    Validate sysvar addresses — Use address = sysvar::xxx::ID constraint
    Don't trust user-provided sysvars — Could be fake data
    Use Anchor's sysvar types — Automatic validation

Remaining Accounts (Medium)

    Validate each remaining account — No automatic checks
    Check ownership and data — Manual validation required
    Document expected format — What remaining accounts are valid

Unsafe Rust (High)

    Minimize unsafe blocks — Only when absolutely necessary
    Validate all inputs — Unsafe doesn't mean unchecked
    Document unsafe justification — Why is it needed and safe

Seed Collisions (High)

    Use unique prefixes — b"user_vault" vs b"admin_vault"
    Include discriminating data — User pubkey, IDs, etc.
    Test collision scenarios — Verify accounts can't overlap

Red Flags

    No slippage protection on swaps
    Direct lamport transfers to user-supplied addresses
    vec![N] where vec![0; N] was intended
    UncheckedAccount without validation logic

8. Advanced Issues
Why It Matters
These issues require deeper understanding of Solana internals and are often missed even by experienced developers.
Security Checks
Dangling Pointers (High)

    Careful with closed accounts — References to closed accounts are invalid
    Don't hold references across instructions — Account data can change
    Reload when uncertain — Fresh reads are safer

Account Reassignment Bug (Medium)

    Avoid temporary reassignments — Changing owner and back is risky
    Data may be wiped — Temporary owner might modify data
    Document ownership lifecycle — When and why owner changes

Heap Exhaustion (Medium)

    Bound loop iterations — No unbounded loops
    Limit allocations — 32KB heap limit
    Use stack when possible — Cheaper than heap

Account Constraint Fragility (Medium)

    Test edge cases — Zero values, max values, same accounts
    Verify constraint logic — Constraints can have subtle bugs
    Use explicit checks — When constraints get complex

Ed25519 Introspection (High)

    Validate instruction position — Signature must be at expected index
    Verify all metadata — Pubkey, message, and signature
    Prevent signature reuse — Different contexts shouldn't share signatures

Red Flags

    References held across CPIs that close accounts
    Temporary owner changes without clear purpose
    Unbounded vectors or loops
    Ed25519 signatures without position validation

Conclusion: Security Is a Process
This checklist is a starting point, not an endpoint. Solana security requires:

    Continuous learning — New patterns and attacks emerge constantly
    Professional audits — Checklists can't replace expert review
    Defense in depth — Multiple layers of protection
    Incident response — Plans for when (not if) issues arise

