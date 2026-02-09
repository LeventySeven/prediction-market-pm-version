; ModuleID = 'LLVMDialectModule'
source_filename = "LLVMDialectModule"

@"mut,close=user,seeds=[Position::SEED,position.market.as_ref(),user.key().as_ref()],bump=position.bump,constraint=position.user==user.key()@VaultError::NotAuthorized" = internal constant [164 x i8] c"mut,close=user,seeds=[Position::SEED,position.market.as_ref(),user.key().as_ref()],bump=position.bump,constraint=position.user==user.key()@VaultError::NotAuthorized"
@"mut,associated_token::mint=usdc_mint,associated_token::authority=fee_recipient,constraint=fee_recipient_ata.key()!=market_vault_ata.key()@VaultError::InvalidAmount" = internal constant [163 x i8] c"mut,associated_token::mint=usdc_mint,associated_token::authority=fee_recipient,constraint=fee_recipient_ata.key()!=market_vault_ata.key()@VaultError::InvalidAmount"
@"mut,associated_token::mint=usdc_mint,associated_token::authority=market," = internal constant [72 x i8] c"mut,associated_token::mint=usdc_mint,associated_token::authority=market,"
@"UncheckedAccount<'info>" = internal constant [23 x i8] c"UncheckedAccount<'info>"
@fee_recipient = internal constant [13 x i8] c"fee_recipient"
@"constraint=fee_recipient.key()==config.authority@VaultError::NotAuthorized" = internal constant [74 x i8] c"constraint=fee_recipient.key()==config.authority@VaultError::NotAuthorized"
@"mut,seeds=[Position::SEED,market.key().as_ref(),user.key().as_ref()],bump=position.bump,constraint=position.user==user.key()@VaultError::NotAuthorized" = internal constant [150 x i8] c"mut,seeds=[Position::SEED,market.key().as_ref(),user.key().as_ref()],bump=position.bump,constraint=position.user==user.key()@VaultError::NotAuthorized"
@market_vault_ata = internal constant [16 x i8] c"market_vault_ata"
@"mut,associated_token::mint=usdc_mint,associated_token::authority=market,constraint=market_vault_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount" = internal constant [152 x i8] c"mut,associated_token::mint=usdc_mint,associated_token::authority=market,constraint=market_vault_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount"
@"Box<Account<'info,Position>>" = internal constant [28 x i8] c"Box<Account<'info,Position>>"
@position = internal constant [8 x i8] c"position"
@"init_if_needed,payer=user,space=8+Position::INIT_SPACE,seeds=[Position::SEED,market.key().as_ref(),user.key().as_ref()],bump" = internal constant [124 x i8] c"init_if_needed,payer=user,space=8+Position::INIT_SPACE,seeds=[Position::SEED,market.key().as_ref(),user.key().as_ref()],bump"
@"mut,seeds=[Market::SEED,market.uuid.as_ref()],bump=market.bump" = internal constant [62 x i8] c"mut,seeds=[Market::SEED,market.uuid.as_ref()],bump=market.bump"
@"mut,seeds=[UserVault::SEED,user.key().as_ref()],bump=user_vault.bump,constraint=user_vault.user==user.key()@VaultError::NotAuthorized" = internal constant [133 x i8] c"mut,seeds=[UserVault::SEED,user.key().as_ref()],bump=user_vault.bump,constraint=user_vault.user==user.key()@VaultError::NotAuthorized"
@vault_usdc_ata = internal constant [14 x i8] c"vault_usdc_ata"
@"mut,associated_token::mint=usdc_mint,associated_token::authority=config,constraint=vault_usdc_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount" = internal constant [150 x i8] c"mut,associated_token::mint=usdc_mint,associated_token::authority=config,constraint=vault_usdc_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount"
@user_usdc_ata = internal constant [13 x i8] c"user_usdc_ata"
@"mut,associated_token::mint=usdc_mint,associated_token::authority=user," = internal constant [70 x i8] c"mut,associated_token::mint=usdc_mint,associated_token::authority=user,"
@"Box<Account<'info,UserVault>>" = internal constant [29 x i8] c"Box<Account<'info,UserVault>>"
@user_vault = internal constant [10 x i8] c"user_vault"
@"init_if_needed,payer=user,space=8+UserVault::INIT_SPACE,seeds=[UserVault::SEED,user.key().as_ref()],bump" = internal constant [104 x i8] c"init_if_needed,payer=user,space=8+UserVault::INIT_SPACE,seeds=[UserVault::SEED,user.key().as_ref()],bump"
@"Program<'info,AssociatedToken>" = internal constant [30 x i8] c"Program<'info,AssociatedToken>"
@associated_token_program = internal constant [24 x i8] c"associated_token_program"
@"Program<'info,Token>" = internal constant [20 x i8] c"Program<'info,Token>"
@token_program = internal constant [13 x i8] c"token_program"
@"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch" = internal constant [69 x i8] c"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch"
@fee_recipient_ata = internal constant [17 x i8] c"fee_recipient_ata"
@"mut,associated_token::mint=usdc_mint,associated_token::authority=config,constraint=fee_recipient_ata.key()!=payer_usdc_ata.key()@VaultError::InvalidAmount" = internal constant [154 x i8] c"mut,associated_token::mint=usdc_mint,associated_token::authority=config,constraint=fee_recipient_ata.key()!=payer_usdc_ata.key()@VaultError::InvalidAmount"
@"Box<Account<'info,TokenAccount>>" = internal constant [32 x i8] c"Box<Account<'info,TokenAccount>>"
@payer_usdc_ata = internal constant [14 x i8] c"payer_usdc_ata"
@"mut,associated_token::mint=usdc_mint,associated_token::authority=payer," = internal constant [71 x i8] c"mut,associated_token::mint=usdc_mint,associated_token::authority=payer,"
@"Box<Account<'info,UserMarketCreation>>" = internal constant [38 x i8] c"Box<Account<'info,UserMarketCreation>>"
@user_market_creation = internal constant [20 x i8] c"user_market_creation"
@"init_if_needed,payer=payer,space=8+UserMarketCreation::INIT_SPACE,seeds=[UserMarketCreation::SEED,payer.key().as_ref()],bump" = internal constant [124 x i8] c"init_if_needed,payer=payer,space=8+UserMarketCreation::INIT_SPACE,seeds=[UserMarketCreation::SEED,payer.key().as_ref()],bump"
@"Box<Account<'info,Market>>" = internal constant [26 x i8] c"Box<Account<'info,Market>>"
@"init,payer=payer,space=8+Market::INIT_SPACE,seeds=[Market::SEED,market_uuid.as_ref()],bump" = internal constant [90 x i8] c"init,payer=payer,space=8+Market::INIT_SPACE,seeds=[Market::SEED,market_uuid.as_ref()],bump"
@payer = internal constant [5 x i8] c"payer"
@"mut,close=new_authority,seeds=[AuthorityTransfer::SEED],bump=authority_transfer.bump" = internal constant [84 x i8] c"mut,close=new_authority,seeds=[AuthorityTransfer::SEED],bump=authority_transfer.bump"
@"mut,seeds=[Config::SEED],bump=config.bump" = internal constant [41 x i8] c"mut,seeds=[Config::SEED],bump=config.bump"
@"mut,close=authority,seeds=[AuthorityTransfer::SEED],bump=authority_transfer.bump" = internal constant [80 x i8] c"mut,close=authority,seeds=[AuthorityTransfer::SEED],bump=authority_transfer.bump"
@"Box<Account<'info,AuthorityTransfer>>" = internal constant [37 x i8] c"Box<Account<'info,AuthorityTransfer>>"
@authority_transfer = internal constant [18 x i8] c"authority_transfer"
@"init_if_needed,payer=authority,space=8+AuthorityTransfer::INIT_SPACE,seeds=[AuthorityTransfer::SEED],bump" = internal constant [105 x i8] c"init_if_needed,payer=authority,space=8+AuthorityTransfer::INIT_SPACE,seeds=[AuthorityTransfer::SEED],bump"
@"seeds=[Config::SEED],bump=config.bump" = internal constant [37 x i8] c"seeds=[Config::SEED],bump=config.bump"
@"Program<'info,System>" = internal constant [21 x i8] c"Program<'info,System>"
@system_program = internal constant [14 x i8] c"system_program"
@"Box<Account<'info,Mint>>" = internal constant [24 x i8] c"Box<Account<'info,Mint>>"
@"Box<Account<'info,Config>>" = internal constant [26 x i8] c"Box<Account<'info,Config>>"
@config = internal constant [6 x i8] c"config"
@"init,payer=authority,space=8+Config::INIT_SPACE,seeds=[Config::SEED],bump" = internal constant [73 x i8] c"init,payer=authority,space=8+Config::INIT_SPACE,seeds=[Config::SEED],bump"
@"Account<'info,ProgramData>" = internal constant [26 x i8] c"Account<'info,ProgramData>"
@program_data = internal constant [12 x i8] c"program_data"
@"Program<'info,PredictionMarketVault>" = internal constant [36 x i8] c"Program<'info,PredictionMarketVault>"
@program = internal constant [7 x i8] c"program"
@"constraint=program.programdata_address()?==Some(program_data.key())" = internal constant [67 x i8] c"constraint=program.programdata_address()?==Some(program_data.key())"
@"Signer<'info>" = internal constant [13 x i8] c"Signer<'info>"
@mut = internal constant [3 x i8] c"mut"
@program_id = internal constant [10 x i8] c"program_id"
@"ctx:Context<ClosePosition>" = internal constant [26 x i8] c"ctx:Context<ClosePosition>"
@"ctx:Context<RefundCancelled>" = internal constant [28 x i8] c"ctx:Context<RefundCancelled>"
@"ctx:Context<CollectFees>" = internal constant [24 x i8] c"ctx:Context<CollectFees>"
@"ctx:Context<ClaimWinnings>" = internal constant [26 x i8] c"ctx:Context<ClaimWinnings>"
@"ctx:Context<ResolveMarket>" = internal constant [26 x i8] c"ctx:Context<ResolveMarket>"
@"min_payout_minor:u64" = internal constant [20 x i8] c"min_payout_minor:u64"
@"payout_minor:u64" = internal constant [16 x i8] c"payout_minor:u64"
@"ctx:Context<SellPosition>" = internal constant [25 x i8] c"ctx:Context<SellPosition>"
@"deadline_ts:i64" = internal constant [15 x i8] c"deadline_ts:i64"
@"max_cost_minor:u64" = internal constant [18 x i8] c"max_cost_minor:u64"
@"shares_minor:u64" = internal constant [16 x i8] c"shares_minor:u64"
@"collateral_minor:u64" = internal constant [20 x i8] c"collateral_minor:u64"
@"outcome:u8" = internal constant [10 x i8] c"outcome:u8"
@"ctx:Context<PlaceBet>" = internal constant [21 x i8] c"ctx:Context<PlaceBet>"
@"ctx:Context<Withdraw>" = internal constant [21 x i8] c"ctx:Context<Withdraw>"
@"amount_minor:u64" = internal constant [16 x i8] c"amount_minor:u64"
@"ctx:Context<Deposit>" = internal constant [20 x i8] c"ctx:Context<Deposit>"
@"market_uuid:[u8;16]" = internal constant [19 x i8] c"market_uuid:[u8;16]"
@"ctx:Context<CreateMarket>" = internal constant [25 x i8] c"ctx:Context<CreateMarket>"
@"ctx:Context<AcceptAuthorityTransfer>" = internal constant [36 x i8] c"ctx:Context<AcceptAuthorityTransfer>"
@"ctx:Context<CancelAuthorityTransfer>" = internal constant [36 x i8] c"ctx:Context<CancelAuthorityTransfer>"
@"new_authority:Pubkey" = internal constant [20 x i8] c"new_authority:Pubkey"
@"ctx:Context<SetPendingAuthority>" = internal constant [32 x i8] c"ctx:Context<SetPendingAuthority>"
@"quote_authority:Pubkey" = internal constant [22 x i8] c"quote_authority:Pubkey"
@"ctx:Context<InitializeConfig>" = internal constant [29 x i8] c"ctx:Context<InitializeConfig>"
@"pos.shares_yes==0&&pos.shares_no==0" = internal constant [35 x i8] c"pos.shares_yes==0&&pos.shares_no==0"
@"Context<ClosePosition>" = internal constant [22 x i8] c"Context<ClosePosition>"
@"ctx.accounts.market.outcome==3" = internal constant [30 x i8] c"ctx.accounts.market.outcome==3"
@"Context<RefundCancelled>" = internal constant [24 x i8] c"Context<RefundCancelled>"
@"authority:ctx.accounts.authority.key(),amount_minor,timestamp:now_ts,}" = internal constant [70 x i8] c"authority:ctx.accounts.authority.key(),amount_minor,timestamp:now_ts,}"
@"FeesCollected{market:ctx.accounts.market.key()" = internal constant [46 x i8] c"FeesCollected{market:ctx.accounts.market.key()"
@"amount_minor<=max_collectible" = internal constant [29 x i8] c"amount_minor<=max_collectible"
@max_collectible = internal constant [15 x i8] c"max_collectible"
@ctx.accounts.market_vault_ata.amount = internal constant [36 x i8] c"ctx.accounts.market_vault_ata.amount"
@remaining_liability = internal constant [19 x i8] c"remaining_liability"
@liability_shares = internal constant [16 x i8] c"liability_shares"
@"2" = internal constant [1 x i8] c"2"
@"outcome>0" = internal constant [9 x i8] c"outcome>0"
@"Context<CollectFees>" = internal constant [20 x i8] c"Context<CollectFees>"
@"WinningsClaimed{user:ctx.accounts.user.key()" = internal constant [44 x i8] c"WinningsClaimed{user:ctx.accounts.user.key()"
@ctx.accounts.market.total_claimed = internal constant [33 x i8] c"ctx.accounts.market.total_claimed"
@"VaultError::MarketNotResolved" = internal constant [29 x i8] c"VaultError::MarketNotResolved"
@"Context<ClaimWinnings>" = internal constant [22 x i8] c"Context<ClaimWinnings>"
@"VaultError::NoWinningPosition" = internal constant [29 x i8] c"VaultError::NoWinningPosition"
@"s>0" = internal constant [3 x i8] c"s>0"
@s = internal constant [1 x i8] c"s"
@"outcome,timestamp:now_ts,}" = internal constant [26 x i8] c"outcome,timestamp:now_ts,}"
@"MarketResolved{market:ctx.accounts.market.key()" = internal constant [47 x i8] c"MarketResolved{market:ctx.accounts.market.key()"
@ctx.accounts.market.outcome = internal constant [27 x i8] c"ctx.accounts.market.outcome"
@"outcome==1||outcome==2||outcome==3" = internal constant [34 x i8] c"outcome==1||outcome==2||outcome==3"
@"Context<ResolveMarket>" = internal constant [22 x i8] c"Context<ResolveMarket>"
@"market:ctx.accounts.market.key(),outcome,shares_minor,payout_minor,timestamp:now_ts,}" = internal constant [85 x i8] c"market:ctx.accounts.market.key(),outcome,shares_minor,payout_minor,timestamp:now_ts,}"
@"PositionSold{user:ctx.accounts.user.key()" = internal constant [41 x i8] c"PositionSold{user:ctx.accounts.user.key()"
@"[&[Market::SEED,ctx.accounts.market.uuid.as_ref(),&[ctx.accounts.market.bump],]]" = internal constant [80 x i8] c"[&[Market::SEED,ctx.accounts.market.uuid.as_ref(),&[ctx.accounts.market.bump],]]"
@"payout_minor>=min_payout_minor" = internal constant [30 x i8] c"payout_minor>=min_payout_minor"
@"shares_minor>0" = internal constant [14 x i8] c"shares_minor>0"
@min_payout_minor = internal constant [16 x i8] c"min_payout_minor"
@payout_minor = internal constant [12 x i8] c"payout_minor"
@"Context<SellPosition>" = internal constant [21 x i8] c"Context<SellPosition>"
@"pos.shares_no>=shares_minor" = internal constant [27 x i8] c"pos.shares_no>=shares_minor"
@"VaultError::InsufficientShares" = internal constant [30 x i8] c"VaultError::InsufficientShares"
@"pos.shares_yes>=shares_minor" = internal constant [28 x i8] c"pos.shares_yes>=shares_minor"
@"market:ctx.accounts.market.key(),outcome,collateral_minor,shares_minor,timestamp:now_ts,}" = internal constant [89 x i8] c"market:ctx.accounts.market.key(),outcome,collateral_minor,shares_minor,timestamp:now_ts,}"
@"BetPlaced{user:ctx.accounts.user.key()" = internal constant [38 x i8] c"BetPlaced{user:ctx.accounts.user.key()"
@ctx.accounts.market_vault_ata = internal constant [29 x i8] c"ctx.accounts.market_vault_ata"
@"1" = internal constant [1 x i8] c"1"
@pos.bump = internal constant [8 x i8] c"pos.bump"
@ctx.bumps.position = internal constant [18 x i8] c"ctx.bumps.position"
@pos.user = internal constant [8 x i8] c"pos.user"
@pos.market = internal constant [10 x i8] c"pos.market"
@pos = internal constant [3 x i8] c"pos"
@ctx.accounts.position = internal constant [21 x i8] c"ctx.accounts.position"
@"ctx.accounts.quote_authority.key()==ctx.accounts.config.quote_authority" = internal constant [71 x i8] c"ctx.accounts.quote_authority.key()==ctx.accounts.config.quote_authority"
@"VaultError::MarketNotOpen" = internal constant [25 x i8] c"VaultError::MarketNotOpen"
@"ctx.accounts.market.outcome==0" = internal constant [30 x i8] c"ctx.accounts.market.outcome==0"
@"collateral_minor<=max_cost_minor" = internal constant [32 x i8] c"collateral_minor<=max_cost_minor"
@"collateral_minor>0&&shares_minor>0" = internal constant [34 x i8] c"collateral_minor>0&&shares_minor>0"
@"VaultError::InvalidOutcome" = internal constant [26 x i8] c"VaultError::InvalidOutcome"
@"outcome==1||outcome==2" = internal constant [22 x i8] c"outcome==1||outcome==2"
@"VaultError::DeadlineExceeded" = internal constant [28 x i8] c"VaultError::DeadlineExceeded"
@"now_ts<=deadline_ts" = internal constant [19 x i8] c"now_ts<=deadline_ts"
@deadline_ts = internal constant [11 x i8] c"deadline_ts"
@max_cost_minor = internal constant [14 x i8] c"max_cost_minor"
@collateral_minor = internal constant [16 x i8] c"collateral_minor"
@"Context<PlaceBet>" = internal constant [17 x i8] c"Context<PlaceBet>"
@ctx.accounts.market.q_no = internal constant [24 x i8] c"ctx.accounts.market.q_no"
@pos.shares_no = internal constant [13 x i8] c"pos.shares_no"
@ctx.accounts.market.q_yes = internal constant [25 x i8] c"ctx.accounts.market.q_yes"
@shares_minor = internal constant [12 x i8] c"shares_minor"
@pos.shares_yes = internal constant [14 x i8] c"pos.shares_yes"
@"Withdrawn{user:ctx.accounts.user.key()" = internal constant [38 x i8] c"Withdrawn{user:ctx.accounts.user.key()"
@signer_seeds = internal constant [12 x i8] c"signer_seeds"
@"[&[Config::SEED,&[ctx.accounts.config.bump]]]" = internal constant [45 x i8] c"[&[Config::SEED,&[ctx.accounts.config.bump]]]"
@"VaultError::InsufficientBalance" = internal constant [31 x i8] c"VaultError::InsufficientBalance"
@"uv.balance>=amount_minor" = internal constant [24 x i8] c"uv.balance>=amount_minor"
@"Context<Withdraw>" = internal constant [17 x i8] c"Context<Withdraw>"
@"amount_minor,new_balance_minor:uv.balance,timestamp:now_ts,}" = internal constant [60 x i8] c"amount_minor,new_balance_minor:uv.balance,timestamp:now_ts,}"
@"Deposited{user:ctx.accounts.user.key()" = internal constant [38 x i8] c"Deposited{user:ctx.accounts.user.key()"
@"VaultError::ArithmeticOverflow" = internal constant [30 x i8] c"VaultError::ArithmeticOverflow"
@uv.balance = internal constant [10 x i8] c"uv.balance"
@uv.bump = internal constant [7 x i8] c"uv.bump"
@ctx.bumps.user_vault = internal constant [20 x i8] c"ctx.bumps.user_vault"
@uv.user = internal constant [7 x i8] c"uv.user"
@uv = internal constant [2 x i8] c"uv"
@ctx.accounts.user_vault = internal constant [23 x i8] c"ctx.accounts.user_vault"
@ctx.accounts.user = internal constant [17 x i8] c"ctx.accounts.user"
@ctx.accounts.vault_usdc_ata = internal constant [27 x i8] c"ctx.accounts.vault_usdc_ata"
@ctx.accounts.user_usdc_ata = internal constant [26 x i8] c"ctx.accounts.user_usdc_ata"
@"amount_minor>0" = internal constant [14 x i8] c"amount_minor>0"
@amount_minor = internal constant [12 x i8] c"amount_minor"
@"Context<Deposit>" = internal constant [16 x i8] c"Context<Deposit>"
@m.bump = internal constant [6 x i8] c"m.bump"
@ctx.bumps.market = internal constant [16 x i8] c"ctx.bumps.market"
@m.total_claimed = internal constant [15 x i8] c"m.total_claimed"
@m.b = internal constant [3 x i8] c"m.b"
@m.q_no = internal constant [6 x i8] c"m.q_no"
@m.q_yes = internal constant [7 x i8] c"m.q_yes"
@m.outcome = internal constant [9 x i8] c"m.outcome"
@m.uuid = internal constant [6 x i8] c"m.uuid"
@m = internal constant [1 x i8] c"m"
@ctx.accounts.market = internal constant [19 x i8] c"ctx.accounts.market"
@"6" = internal constant [1 x i8] c"6"
@CREATE_MARKET_FEE_MINOR = internal constant [23 x i8] c"CREATE_MARKET_FEE_MINOR"
@cpi_ctx = internal constant [7 x i8] c"cpi_ctx"
@ctx.accounts.token_program = internal constant [26 x i8] c"ctx.accounts.token_program"
@cpi_accounts = internal constant [12 x i8] c"cpi_accounts"
@mint = internal constant [4 x i8] c"mint"
@to = internal constant [2 x i8] c"to"
@ctx.accounts.fee_recipient_ata = internal constant [30 x i8] c"ctx.accounts.fee_recipient_ata"
@from = internal constant [4 x i8] c"from"
@ctx.accounts.payer_usdc_ata = internal constant [27 x i8] c"ctx.accounts.payer_usdc_ata"
@rate.bump = internal constant [9 x i8] c"rate.bump"
@ctx.bumps.user_market_creation = internal constant [30 x i8] c"ctx.bumps.user_market_creation"
@rate.user = internal constant [9 x i8] c"rate.user"
@ctx.accounts.payer = internal constant [18 x i8] c"ctx.accounts.payer"
@"0" = internal constant [1 x i8] c"0"
@rate.last_created_ts = internal constant [20 x i8] c"rate.last_created_ts"
@rate = internal constant [4 x i8] c"rate"
@ctx.accounts.user_market_creation = internal constant [33 x i8] c"ctx.accounts.user_market_creation"
@now_ts = internal constant [6 x i8] c"now_ts"
@"Clock::get()?.unix_timestamp" = internal constant [28 x i8] c"Clock::get()?.unix_timestamp"
@market_uuid = internal constant [11 x i8] c"market_uuid"
@"Context<CreateMarket>" = internal constant [21 x i8] c"Context<CreateMarket>"
@"VaultError::RateLimitExceeded" = internal constant [29 x i8] c"VaultError::RateLimitExceeded"
@"now_ts-rate.last_created_ts>=600" = internal constant [32 x i8] c"now_ts-rate.last_created_ts>=600"
@ctx.accounts.config.authority = internal constant [29 x i8] c"ctx.accounts.config.authority"
@ctx.accounts.new_authority = internal constant [26 x i8] c"ctx.accounts.new_authority"
@"ctx.accounts.authority_transfer.pending_authority==ctx.accounts.new_authority.key()" = internal constant [83 x i8] c"ctx.accounts.authority_transfer.pending_authority==ctx.accounts.new_authority.key()"
@"Context<AcceptAuthorityTransfer>" = internal constant [32 x i8] c"Context<AcceptAuthorityTransfer>"
@"Context<CancelAuthorityTransfer>" = internal constant [32 x i8] c"Context<CancelAuthorityTransfer>"
@transfer.bump = internal constant [13 x i8] c"transfer.bump"
@ctx.bumps.authority_transfer = internal constant [28 x i8] c"ctx.bumps.authority_transfer"
@transfer.pending_authority = internal constant [26 x i8] c"transfer.pending_authority"
@transfer = internal constant [8 x i8] c"transfer"
@ctx.accounts.authority_transfer = internal constant [31 x i8] c"ctx.accounts.authority_transfer"
@"VaultError::InvalidAuthority" = internal constant [28 x i8] c"VaultError::InvalidAuthority"
@"new_authority!=Pubkey::default()" = internal constant [32 x i8] c"new_authority!=Pubkey::default()"
@"ctx.accounts.authority.key()==ctx.accounts.config.authority" = internal constant [59 x i8] c"ctx.accounts.authority.key()==ctx.accounts.config.authority"
@new_authority = internal constant [13 x i8] c"new_authority"
@"Context<SetPendingAuthority>" = internal constant [28 x i8] c"Context<SetPendingAuthority>"
@"()" = internal constant [2 x i8] c"()"
@cfg.bump = internal constant [8 x i8] c"cfg.bump"
@ctx.bumps.config = internal constant [16 x i8] c"ctx.bumps.config"
@cfg.usdc_mint = internal constant [13 x i8] c"cfg.usdc_mint"
@ctx.accounts.usdc_mint = internal constant [22 x i8] c"ctx.accounts.usdc_mint"
@cfg.quote_authority = internal constant [19 x i8] c"cfg.quote_authority"
@cfg.authority = internal constant [13 x i8] c"cfg.authority"
@ctx.accounts.authority = internal constant [22 x i8] c"ctx.accounts.authority"
@cfg = internal constant [3 x i8] c"cfg"
@ctx.accounts.config = internal constant [19 x i8] c"ctx.accounts.config"
@"VaultError::InvalidAmount" = internal constant [25 x i8] c"VaultError::InvalidAmount"
@"ctx.accounts.usdc_mint.decimals==6" = internal constant [34 x i8] c"ctx.accounts.usdc_mint.decimals==6"
@"VaultError::NotAuthorized" = internal constant [25 x i8] c"VaultError::NotAuthorized"
@"ctx.accounts.program_data.upgrade_authority_address==Some(ctx.accounts.authority.key())" = internal constant [87 x i8] c"ctx.accounts.program_data.upgrade_authority_address==Some(ctx.accounts.authority.key())"
@"Context<InitializeConfig>" = internal constant [25 x i8] c"Context<InitializeConfig>"
@ctx = internal constant [3 x i8] c"ctx"
@shares_no = internal constant [9 x i8] c"shares_no"
@shares_yes = internal constant [10 x i8] c"shares_yes"
@market = internal constant [6 x i8] c"market"
@total_claimed = internal constant [13 x i8] c"total_claimed"
@b = internal constant [1 x i8] c"b"
@q_no = internal constant [4 x i8] c"q_no"
@q_yes = internal constant [5 x i8] c"q_yes"
@outcome = internal constant [7 x i8] c"outcome"
@"[u8;16]" = internal constant [7 x i8] c"[u8;16]"
@uuid = internal constant [4 x i8] c"uuid"
@i64 = internal constant [3 x i8] c"i64"
@last_created_ts = internal constant [15 x i8] c"last_created_ts"
@u64 = internal constant [3 x i8] c"u64"
@balance = internal constant [7 x i8] c"balance"
@user = internal constant [4 x i8] c"user"
@pending_authority = internal constant [17 x i8] c"pending_authority"
@u8 = internal constant [2 x i8] c"u8"
@bump = internal constant [4 x i8] c"bump"
@usdc_mint = internal constant [9 x i8] c"usdc_mint"
@quote_authority = internal constant [15 x i8] c"quote_authority"
@Pubkey = internal constant [6 x i8] c"Pubkey"
@authority = internal constant [9 x i8] c"authority"
@"*i8" = internal constant [3 x i8] c"*i8"
@parser.error = internal constant [12 x i8] c"parser.error"
@As8oG6d6GVyEGSgRqTHLKLEc5ZumyBy4KxHaAbv6fAZT = internal constant [44 x i8] c"As8oG6d6GVyEGSgRqTHLKLEc5ZumyBy4KxHaAbv6fAZT"
@"8.0.0" = internal constant [5 x i8] c"8.0.0"
@dependencies.spl-token.version = internal constant [30 x i8] c"dependencies.spl-token.version"
@dependencies.anchor-spl.version = internal constant [31 x i8] c"dependencies.anchor-spl.version"
@"0.32.1" = internal constant [6 x i8] c"0.32.1"
@dependencies.anchor-lang.version = internal constant [32 x i8] c"dependencies.anchor-lang.version"

declare i8* @malloc(i64)

declare void @free(i8*)

declare i8* @sol.model.struct.constraint(i8*)

declare i8* @sol.close_position.1(i8*)

declare i8* @sol.refund_cancelled.2(i8*, i8*)

declare i8* @sol.collect_fees.2(i8*, i8*)

declare i8* @sol.claim_winnings.2(i8*, i8*)

declare i8* @sol.resolve_market.2(i8*, i8*)

declare i8* @sol.sell_position.6(i8*, i8*, i8*, i8*, i8*, i8*)

declare i8* @sol.place_bet.6(i8*, i8*, i8*, i8*, i8*, i8*)

declare i8* @sol.withdraw.2(i8*, i8*)

declare i8* @sol.deposit.2(i8*, i8*)

declare i8* @sol.create_market.2(i8*, i8*)

declare i8* @sol.accept_authority_transfer.1(i8*)

declare i8* @sol.cancel_authority_transfer.1(i8*)

declare i8* @sol.set_pending_authority.2(i8*, i8*)

declare i8* @sol.initialize_config.2(i8*, i8*)

declare i8* @sol.unwrap_or.2(i8*, i8*)

declare i8* @sol.ifTrueFalse.anon.(i8*, i8*)

declare i8* @"sol.lib::collect_fees.anon.3"(i8*)

declare i8* @"sol.lib::collect_fees.anon.2"(i8*)

declare i8* @"sol.lib::collect_fees.anon.1"(i8*)

declare i8* @"sol.lib::claim_winnings.anon.2"(i8*)

declare i8* @"sol.lib::claim_winnings.anon.1"(i8*)

declare i8* @"sol.lib::sell_position.anon.2"(i8*)

declare i8* @"sol.lib::sell_position.anon.1"(i8*)

declare i8* @sol.ifFalse.anon.(i8*)

declare i8* @"sol.lib::place_bet.anon.2"(i8*)

declare i8* @"sol.lib::place_bet.anon.1"(i8*)

declare i8* @"sol.=="(i8*, i8*)

declare i8* @"sol.CpiContext::new_with_signer.3"(i8*, i8*, i8*)

declare i8* @sol.checked_sub.2(i8*, i8*)

declare i8* @"sol.emit.!2"(i8*, i8*)

declare i8* @sol.ok_or.2(i8*, i8*)

declare i8* @sol.checked_add.2(i8*, i8*)

declare i8* @"sol.token::transfer_checked.3"(i8*, i8*, i8*)

declare i8* @"sol.CpiContext::new.2"(i8*, i8*)

declare i8* @sol.model.struct.new.TransferChecked.4(i8*, i8*, i8*, i8*)

declare i8* @sol.to_account_info.1(i8*)

declare i8* @sol.ifTrue.anon.(i8*)

declare i8* @"sol.lib::create_market.anon.1"(i8*)

declare i8* @sol.if(i8*)

declare i8* @"sol.!="(i8*, i8*)

declare i8* @sol.Ok.1(i8*)

declare i8* @sol.key.1(i8*)

declare void @sol.model.opaqueAssign(i8*, i8*)

declare i8* @"sol.require.!2"(i8*, i8*)

declare i8* @sol.model.struct.field(i8*, i8*)

declare i8* @sol.model.funcArg(i8*, i8*)

declare i8* @sol.model.declare_id(i8*)

declare i8* @sol.model.toml(i8*, i8*)

define i64 @sol.model.cargo.toml(i8* %0) !dbg !3 {
  %2 = call i8* @sol.model.toml(i8* getelementptr inbounds ([32 x i8], [32 x i8]* @dependencies.anchor-lang.version, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @"0.32.1", i64 0, i64 0)), !dbg !7
  %3 = call i8* @sol.model.toml(i8* getelementptr inbounds ([31 x i8], [31 x i8]* @dependencies.anchor-spl.version, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @"0.32.1", i64 0, i64 0)), !dbg !7
  %4 = call i8* @sol.model.toml(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @dependencies.spl-token.version, i64 0, i64 0), i8* getelementptr inbounds ([5 x i8], [5 x i8]* @"8.0.0", i64 0, i64 0)), !dbg !7
  ret i64 0, !dbg !10
}

define i64 @sol.model.declare_id.address(i8* %0) !dbg !12 {
  %2 = call i8* @sol.model.declare_id(i8* getelementptr inbounds ([44 x i8], [44 x i8]* @As8oG6d6GVyEGSgRqTHLKLEc5ZumyBy4KxHaAbv6fAZT, i64 0, i64 0)), !dbg !13
  ret i64 0, !dbg !16
}

define i8* @sol.model.struct.anchor.Config(i8* %0) !dbg !18 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !20
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !22
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([15 x i8], [15 x i8]* @quote_authority, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !23
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !24
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !25
  ret i8* %0, !dbg !20
}

define i8* @sol.model.struct.Config(i8* %0) !dbg !26 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !27
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !29
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([15 x i8], [15 x i8]* @quote_authority, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !30
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !31
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !32
  ret i8* %0, !dbg !27
}

define i8* @sol.model.struct.anchor.AuthorityTransfer(i8* %0) !dbg !33 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !34
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([17 x i8], [17 x i8]* @pending_authority, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !36
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !37
  ret i8* %0, !dbg !34
}

define i8* @sol.model.struct.AuthorityTransfer(i8* %0) !dbg !38 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !39
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([17 x i8], [17 x i8]* @pending_authority, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !41
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !42
  ret i8* %0, !dbg !39
}

define i8* @sol.model.struct.anchor.UserVault(i8* %0) !dbg !43 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !44
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !46
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @balance, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !47
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !48
  ret i8* %0, !dbg !44
}

define i8* @sol.model.struct.UserVault(i8* %0) !dbg !49 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !50
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !52
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @balance, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !53
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !54
  ret i8* %0, !dbg !50
}

define i8* @sol.model.struct.anchor.UserMarketCreation(i8* %0) !dbg !55 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !56
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !58
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([15 x i8], [15 x i8]* @last_created_ts, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @i64, i64 0, i64 0)), !dbg !59
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !60
  ret i8* %0, !dbg !56
}

define i8* @sol.model.struct.UserMarketCreation(i8* %0) !dbg !61 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !62
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !64
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([15 x i8], [15 x i8]* @last_created_ts, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @i64, i64 0, i64 0)), !dbg !65
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !66
  ret i8* %0, !dbg !62
}

define i8* @sol.model.struct.anchor.Market(i8* %0) !dbg !67 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !68
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @uuid, i64 0, i64 0), i8* getelementptr inbounds ([7 x i8], [7 x i8]* @"[u8;16]", i64 0, i64 0)), !dbg !70
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !71
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([5 x i8], [5 x i8]* @q_yes, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !72
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @q_no, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !73
  %7 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([1 x i8], [1 x i8]* @b, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !74
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @total_claimed, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !75
  %9 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !76
  ret i8* %0, !dbg !68
}

define i8* @sol.model.struct.Market(i8* %0) !dbg !77 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !78
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @uuid, i64 0, i64 0), i8* getelementptr inbounds ([7 x i8], [7 x i8]* @"[u8;16]", i64 0, i64 0)), !dbg !80
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !81
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([5 x i8], [5 x i8]* @q_yes, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !82
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @q_no, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !83
  %7 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([1 x i8], [1 x i8]* @b, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !84
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @total_claimed, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !85
  %9 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !86
  ret i8* %0, !dbg !78
}

define i8* @sol.model.struct.anchor.Position(i8* %0) !dbg !87 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !88
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @market, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !90
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !91
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @shares_yes, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !92
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @shares_no, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !93
  %7 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !94
  ret i8* %0, !dbg !88
}

define i8* @sol.model.struct.Position(i8* %0) !dbg !95 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !96
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @market, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !98
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !99
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @shares_yes, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !100
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @shares_no, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !101
  %7 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @bump, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !102
  ret i8* %0, !dbg !96
}

define i8* @"lib::initialize_config.2"(i8* %0, i8* %1) !dbg !103 {
  %3 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"Context<InitializeConfig>", i64 0, i64 0)), !dbg !104
  %4 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([15 x i8], [15 x i8]* @quote_authority, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !104
  %5 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([87 x i8], [87 x i8]* @"ctx.accounts.program_data.upgrade_authority_address==Some(ctx.accounts.authority.key())", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::NotAuthorized", i64 0, i64 0)), !dbg !106
  %6 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([34 x i8], [34 x i8]* @"ctx.accounts.usdc_mint.decimals==6", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !107
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @cfg, i64 0, i64 0), i8* getelementptr inbounds ([19 x i8], [19 x i8]* @ctx.accounts.config, i64 0, i64 0)), !dbg !108
  %7 = call i8* @sol.key.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.authority, i64 0, i64 0)), !dbg !109
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @cfg.authority, i64 0, i64 0), i8* %7), !dbg !110
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @cfg.quote_authority, i64 0, i64 0), i8* %1), !dbg !111
  %8 = call i8* @sol.key.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.usdc_mint, i64 0, i64 0)), !dbg !112
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @cfg.usdc_mint, i64 0, i64 0), i8* %8), !dbg !113
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @cfg.bump, i64 0, i64 0), i8* getelementptr inbounds ([16 x i8], [16 x i8]* @ctx.bumps.config, i64 0, i64 0)), !dbg !114
  %9 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !115
  ret i8* %0, !dbg !104
}

define i8* @"lib::set_pending_authority.2"(i8* %0, i8* %1) !dbg !116 {
  %3 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Context<SetPendingAuthority>", i64 0, i64 0)), !dbg !117
  %4 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @new_authority, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @Pubkey, i64 0, i64 0)), !dbg !117
  %5 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([59 x i8], [59 x i8]* @"ctx.accounts.authority.key()==ctx.accounts.config.authority", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::NotAuthorized", i64 0, i64 0)), !dbg !119
  %6 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"new_authority!=Pubkey::default()", i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"VaultError::InvalidAuthority", i64 0, i64 0)), !dbg !120
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @transfer, i64 0, i64 0), i8* getelementptr inbounds ([31 x i8], [31 x i8]* @ctx.accounts.authority_transfer, i64 0, i64 0)), !dbg !121
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @transfer.pending_authority, i64 0, i64 0), i8* %1), !dbg !122
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @transfer.bump, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @ctx.bumps.authority_transfer, i64 0, i64 0)), !dbg !123
  %7 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !124
  ret i8* %0, !dbg !117
}

define i8* @"lib::cancel_authority_transfer.1"(i8* %0) !dbg !125 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Context<CancelAuthorityTransfer>", i64 0, i64 0)), !dbg !126
  %3 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([59 x i8], [59 x i8]* @"ctx.accounts.authority.key()==ctx.accounts.config.authority", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::NotAuthorized", i64 0, i64 0)), !dbg !128
  %4 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !129
  ret i8* %0, !dbg !126
}

define i8* @"lib::accept_authority_transfer.1"(i8* %0) !dbg !130 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Context<AcceptAuthorityTransfer>", i64 0, i64 0)), !dbg !131
  %3 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([83 x i8], [83 x i8]* @"ctx.accounts.authority_transfer.pending_authority==ctx.accounts.new_authority.key()", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::NotAuthorized", i64 0, i64 0)), !dbg !133
  %4 = call i8* @sol.key.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.new_authority, i64 0, i64 0)), !dbg !134
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([29 x i8], [29 x i8]* @ctx.accounts.config.authority, i64 0, i64 0), i8* %4), !dbg !135
  %5 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !136
  ret i8* %0, !dbg !131
}

define i8* @"lib::create_market.anon.1"(i8* %0) !dbg !137 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !138
  %3 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"now_ts-rate.last_created_ts>=600", i64 0, i64 0), i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"VaultError::RateLimitExceeded", i64 0, i64 0)), !dbg !140
  ret i8* %0, !dbg !138
}

define i8* @"lib::create_market.2"(i8* %0, i8* %1) !dbg !141 {
  %3 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"Context<CreateMarket>", i64 0, i64 0)), !dbg !142
  %4 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([11 x i8], [11 x i8]* @market_uuid, i64 0, i64 0), i8* getelementptr inbounds ([7 x i8], [7 x i8]* @"[u8;16]", i64 0, i64 0)), !dbg !142
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @now_ts, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Clock::get()?.unix_timestamp", i64 0, i64 0)), !dbg !144
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @rate, i64 0, i64 0), i8* getelementptr inbounds ([33 x i8], [33 x i8]* @ctx.accounts.user_market_creation, i64 0, i64 0)), !dbg !145
  %5 = call i8* @"sol.!="(i8* getelementptr inbounds ([20 x i8], [20 x i8]* @rate.last_created_ts, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !146
  %6 = call i8* @sol.if(i8* %5), !dbg !147
  %7 = call i8* @"sol.lib::create_market.anon.1"(i8* %6), !dbg !148
  %8 = call i8* @sol.ifTrue.anon.(i8* %7), !dbg !148
  %9 = call i8* @sol.key.1(i8* getelementptr inbounds ([18 x i8], [18 x i8]* @ctx.accounts.payer, i64 0, i64 0)), !dbg !149
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @rate.user, i64 0, i64 0), i8* %9), !dbg !150
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([20 x i8], [20 x i8]* @rate.last_created_ts, i64 0, i64 0), i8* getelementptr inbounds ([6 x i8], [6 x i8]* @now_ts, i64 0, i64 0)), !dbg !151
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @rate.bump, i64 0, i64 0), i8* getelementptr inbounds ([30 x i8], [30 x i8]* @ctx.bumps.user_market_creation, i64 0, i64 0)), !dbg !152
  %10 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([27 x i8], [27 x i8]* @ctx.accounts.payer_usdc_ata, i64 0, i64 0)), !dbg !153
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* %10), !dbg !154
  %11 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @ctx.accounts.fee_recipient_ata, i64 0, i64 0)), !dbg !155
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* %11), !dbg !156
  %12 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([18 x i8], [18 x i8]* @ctx.accounts.payer, i64 0, i64 0)), !dbg !157
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* %12), !dbg !158
  %13 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.usdc_mint, i64 0, i64 0)), !dbg !159
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0), i8* %13), !dbg !160
  %14 = call i8* @sol.model.struct.new.TransferChecked.4(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0)), !dbg !161
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* %14), !dbg !162
  %15 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.token_program, i64 0, i64 0)), !dbg !163
  %16 = call i8* @"sol.CpiContext::new.2"(i8* %15, i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0)), !dbg !164
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %16), !dbg !165
  %17 = call i8* @"sol.token::transfer_checked.3"(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* getelementptr inbounds ([23 x i8], [23 x i8]* @CREATE_MARKET_FEE_MINOR, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"6", i64 0, i64 0)), !dbg !166
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([1 x i8], [1 x i8]* @m, i64 0, i64 0), i8* getelementptr inbounds ([19 x i8], [19 x i8]* @ctx.accounts.market, i64 0, i64 0)), !dbg !167
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @m.uuid, i64 0, i64 0), i8* %1), !dbg !168
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @m.outcome, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !169
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @m.q_yes, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !170
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @m.q_no, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !171
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @m.b, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !172
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([15 x i8], [15 x i8]* @m.total_claimed, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !173
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @m.bump, i64 0, i64 0), i8* getelementptr inbounds ([16 x i8], [16 x i8]* @ctx.bumps.market, i64 0, i64 0)), !dbg !174
  %18 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !175
  ret i8* %0, !dbg !142
}

define i8* @"lib::deposit.2"(i8* %0, i8* %1) !dbg !176 {
  %3 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([16 x i8], [16 x i8]* @"Context<Deposit>", i64 0, i64 0)), !dbg !177
  %4 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @amount_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !177
  %5 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @"amount_minor>0", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !179
  %6 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.user_usdc_ata, i64 0, i64 0)), !dbg !180
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* %6), !dbg !181
  %7 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([27 x i8], [27 x i8]* @ctx.accounts.vault_usdc_ata, i64 0, i64 0)), !dbg !182
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* %7), !dbg !183
  %8 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([17 x i8], [17 x i8]* @ctx.accounts.user, i64 0, i64 0)), !dbg !184
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* %8), !dbg !185
  %9 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.usdc_mint, i64 0, i64 0)), !dbg !186
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0), i8* %9), !dbg !187
  %10 = call i8* @sol.model.struct.new.TransferChecked.4(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0)), !dbg !188
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* %10), !dbg !189
  %11 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.token_program, i64 0, i64 0)), !dbg !190
  %12 = call i8* @"sol.CpiContext::new.2"(i8* %11, i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0)), !dbg !191
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %12), !dbg !192
  %13 = call i8* @"sol.token::transfer_checked.3"(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %1, i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"6", i64 0, i64 0)), !dbg !193
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @uv, i64 0, i64 0), i8* getelementptr inbounds ([23 x i8], [23 x i8]* @ctx.accounts.user_vault, i64 0, i64 0)), !dbg !194
  %14 = call i8* @sol.key.1(i8* getelementptr inbounds ([17 x i8], [17 x i8]* @ctx.accounts.user, i64 0, i64 0)), !dbg !195
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @uv.user, i64 0, i64 0), i8* %14), !dbg !196
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @uv.bump, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @ctx.bumps.user_vault, i64 0, i64 0)), !dbg !197
  %15 = call i8* @sol.checked_add.2(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @uv.balance, i64 0, i64 0), i8* %1), !dbg !198
  %16 = call i8* @sol.ok_or.2(i8* %15, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !199
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @uv.balance, i64 0, i64 0), i8* %16), !dbg !200
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @now_ts, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Clock::get()?.unix_timestamp", i64 0, i64 0)), !dbg !201
  %17 = call i8* @"sol.emit.!2"(i8* getelementptr inbounds ([38 x i8], [38 x i8]* @"Deposited{user:ctx.accounts.user.key()", i64 0, i64 0), i8* getelementptr inbounds ([60 x i8], [60 x i8]* @"amount_minor,new_balance_minor:uv.balance,timestamp:now_ts,}", i64 0, i64 0)), !dbg !202
  %18 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !203
  ret i8* %0, !dbg !177
}

define i8* @"lib::withdraw.2"(i8* %0, i8* %1) !dbg !204 {
  %3 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([17 x i8], [17 x i8]* @"Context<Withdraw>", i64 0, i64 0)), !dbg !205
  %4 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @amount_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !205
  %5 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @"amount_minor>0", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !207
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @uv, i64 0, i64 0), i8* getelementptr inbounds ([23 x i8], [23 x i8]* @ctx.accounts.user_vault, i64 0, i64 0)), !dbg !208
  %6 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"uv.balance>=amount_minor", i64 0, i64 0), i8* getelementptr inbounds ([31 x i8], [31 x i8]* @"VaultError::InsufficientBalance", i64 0, i64 0)), !dbg !209
  %7 = call i8* @sol.checked_sub.2(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @uv.balance, i64 0, i64 0), i8* %1), !dbg !210
  %8 = call i8* @sol.ok_or.2(i8* %7, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !211
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @uv.balance, i64 0, i64 0), i8* %8), !dbg !212
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0), i8* getelementptr inbounds ([45 x i8], [45 x i8]* @"[&[Config::SEED,&[ctx.accounts.config.bump]]]", i64 0, i64 0)), !dbg !213
  %9 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([27 x i8], [27 x i8]* @ctx.accounts.vault_usdc_ata, i64 0, i64 0)), !dbg !214
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* %9), !dbg !215
  %10 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.user_usdc_ata, i64 0, i64 0)), !dbg !216
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* %10), !dbg !217
  %11 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @ctx.accounts.config, i64 0, i64 0)), !dbg !218
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* %11), !dbg !219
  %12 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.usdc_mint, i64 0, i64 0)), !dbg !220
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0), i8* %12), !dbg !221
  %13 = call i8* @sol.model.struct.new.TransferChecked.4(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0)), !dbg !222
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* %13), !dbg !223
  %14 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.token_program, i64 0, i64 0)), !dbg !224
  %15 = call i8* @"sol.CpiContext::new_with_signer.3"(i8* %14, i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0)), !dbg !225
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %15), !dbg !226
  %16 = call i8* @"sol.token::transfer_checked.3"(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %1, i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"6", i64 0, i64 0)), !dbg !227
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @now_ts, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Clock::get()?.unix_timestamp", i64 0, i64 0)), !dbg !228
  %17 = call i8* @"sol.emit.!2"(i8* getelementptr inbounds ([38 x i8], [38 x i8]* @"Withdrawn{user:ctx.accounts.user.key()", i64 0, i64 0), i8* getelementptr inbounds ([60 x i8], [60 x i8]* @"amount_minor,new_balance_minor:uv.balance,timestamp:now_ts,}", i64 0, i64 0)), !dbg !229
  %18 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !230
  ret i8* %0, !dbg !205
}

define i8* @"lib::place_bet.anon.1"(i8* %0) !dbg !231 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !232
  %3 = call i8* @sol.checked_add.2(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @pos.shares_yes, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !234
  %4 = call i8* @sol.ok_or.2(i8* %3, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !235
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @pos.shares_yes, i64 0, i64 0), i8* %4), !dbg !236
  %5 = call i8* @sol.checked_add.2(i8* getelementptr inbounds ([25 x i8], [25 x i8]* @ctx.accounts.market.q_yes, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !237
  %6 = call i8* @sol.ok_or.2(i8* %5, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !238
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([25 x i8], [25 x i8]* @ctx.accounts.market.q_yes, i64 0, i64 0), i8* %6), !dbg !239
  ret i8* %0, !dbg !232
}

define i8* @"lib::place_bet.anon.2"(i8* %0) !dbg !240 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !241
  %3 = call i8* @sol.checked_add.2(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @pos.shares_no, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !243
  %4 = call i8* @sol.ok_or.2(i8* %3, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !244
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @pos.shares_no, i64 0, i64 0), i8* %4), !dbg !245
  %5 = call i8* @sol.checked_add.2(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @ctx.accounts.market.q_no, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !246
  %6 = call i8* @sol.ok_or.2(i8* %5, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !247
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @ctx.accounts.market.q_no, i64 0, i64 0), i8* %6), !dbg !248
  ret i8* %0, !dbg !241
}

define i8* @"lib::place_bet.6"(i8* %0, i8* %1, i8* %2, i8* %3, i8* %4, i8* %5) !dbg !249 {
  %7 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([17 x i8], [17 x i8]* @"Context<PlaceBet>", i64 0, i64 0)), !dbg !250
  %8 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !250
  %9 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @collateral_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !250
  %10 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !250
  %11 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @max_cost_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !250
  %12 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([11 x i8], [11 x i8]* @deadline_ts, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @i64, i64 0, i64 0)), !dbg !250
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @now_ts, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Clock::get()?.unix_timestamp", i64 0, i64 0)), !dbg !252
  %13 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @"now_ts<=deadline_ts", i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"VaultError::DeadlineExceeded", i64 0, i64 0)), !dbg !253
  %14 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @"outcome==1||outcome==2", i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"VaultError::InvalidOutcome", i64 0, i64 0)), !dbg !254
  %15 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([34 x i8], [34 x i8]* @"collateral_minor>0&&shares_minor>0", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !255
  %16 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"collateral_minor<=max_cost_minor", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !256
  %17 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"ctx.accounts.market.outcome==0", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::MarketNotOpen", i64 0, i64 0)), !dbg !257
  %18 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([71 x i8], [71 x i8]* @"ctx.accounts.quote_authority.key()==ctx.accounts.config.quote_authority", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::NotAuthorized", i64 0, i64 0)), !dbg !258
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @pos, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @ctx.accounts.position, i64 0, i64 0)), !dbg !259
  %19 = call i8* @sol.key.1(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @ctx.accounts.market, i64 0, i64 0)), !dbg !260
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @pos.market, i64 0, i64 0), i8* %19), !dbg !261
  %20 = call i8* @sol.key.1(i8* getelementptr inbounds ([17 x i8], [17 x i8]* @ctx.accounts.user, i64 0, i64 0)), !dbg !262
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @pos.user, i64 0, i64 0), i8* %20), !dbg !263
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @pos.bump, i64 0, i64 0), i8* getelementptr inbounds ([18 x i8], [18 x i8]* @ctx.bumps.position, i64 0, i64 0)), !dbg !264
  %21 = call i8* @"sol.=="(i8* %1, i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"1", i64 0, i64 0)), !dbg !265
  %22 = call i8* @sol.if(i8* %21), !dbg !266
  %23 = call i8* @"sol.lib::place_bet.anon.1"(i8* %22), !dbg !267
  %24 = call i8* @sol.ifTrue.anon.(i8* %23), !dbg !267
  %25 = call i8* @"sol.lib::place_bet.anon.2"(i8* %24), !dbg !268
  %26 = call i8* @sol.ifFalse.anon.(i8* %25), !dbg !268
  %27 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.user_usdc_ata, i64 0, i64 0)), !dbg !269
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* %27), !dbg !270
  %28 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([29 x i8], [29 x i8]* @ctx.accounts.market_vault_ata, i64 0, i64 0)), !dbg !271
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* %28), !dbg !272
  %29 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([17 x i8], [17 x i8]* @ctx.accounts.user, i64 0, i64 0)), !dbg !273
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* %29), !dbg !274
  %30 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.usdc_mint, i64 0, i64 0)), !dbg !275
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0), i8* %30), !dbg !276
  %31 = call i8* @sol.model.struct.new.TransferChecked.4(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0)), !dbg !277
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* %31), !dbg !278
  %32 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.token_program, i64 0, i64 0)), !dbg !279
  %33 = call i8* @"sol.CpiContext::new.2"(i8* %32, i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0)), !dbg !280
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %33), !dbg !281
  %34 = call i8* @"sol.token::transfer_checked.3"(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %2, i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"6", i64 0, i64 0)), !dbg !282
  %35 = call i8* @"sol.emit.!2"(i8* getelementptr inbounds ([38 x i8], [38 x i8]* @"BetPlaced{user:ctx.accounts.user.key()", i64 0, i64 0), i8* getelementptr inbounds ([89 x i8], [89 x i8]* @"market:ctx.accounts.market.key(),outcome,collateral_minor,shares_minor,timestamp:now_ts,}", i64 0, i64 0)), !dbg !283
  %36 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !284
  ret i8* %0, !dbg !250
}

define i8* @"lib::sell_position.anon.1"(i8* %0) !dbg !285 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !286
  %3 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"pos.shares_yes>=shares_minor", i64 0, i64 0), i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::InsufficientShares", i64 0, i64 0)), !dbg !288
  %4 = call i8* @sol.checked_sub.2(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @pos.shares_yes, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !289
  %5 = call i8* @sol.ok_or.2(i8* %4, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !290
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @pos.shares_yes, i64 0, i64 0), i8* %5), !dbg !291
  %6 = call i8* @sol.checked_sub.2(i8* getelementptr inbounds ([25 x i8], [25 x i8]* @ctx.accounts.market.q_yes, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !292
  %7 = call i8* @sol.ok_or.2(i8* %6, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !293
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([25 x i8], [25 x i8]* @ctx.accounts.market.q_yes, i64 0, i64 0), i8* %7), !dbg !294
  ret i8* %0, !dbg !286
}

define i8* @"lib::sell_position.anon.2"(i8* %0) !dbg !295 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !296
  %3 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([27 x i8], [27 x i8]* @"pos.shares_no>=shares_minor", i64 0, i64 0), i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::InsufficientShares", i64 0, i64 0)), !dbg !298
  %4 = call i8* @sol.checked_sub.2(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @pos.shares_no, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !299
  %5 = call i8* @sol.ok_or.2(i8* %4, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !300
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @pos.shares_no, i64 0, i64 0), i8* %5), !dbg !301
  %6 = call i8* @sol.checked_sub.2(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @ctx.accounts.market.q_no, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !302
  %7 = call i8* @sol.ok_or.2(i8* %6, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !303
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @ctx.accounts.market.q_no, i64 0, i64 0), i8* %7), !dbg !304
  ret i8* %0, !dbg !296
}

define i8* @"lib::sell_position.6"(i8* %0, i8* %1, i8* %2, i8* %3, i8* %4, i8* %5) !dbg !305 {
  %7 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"Context<SellPosition>", i64 0, i64 0)), !dbg !306
  %8 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !306
  %9 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !306
  %10 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @payout_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !306
  %11 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @min_payout_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !306
  %12 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([11 x i8], [11 x i8]* @deadline_ts, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @i64, i64 0, i64 0)), !dbg !306
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @now_ts, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Clock::get()?.unix_timestamp", i64 0, i64 0)), !dbg !308
  %13 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @"now_ts<=deadline_ts", i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"VaultError::DeadlineExceeded", i64 0, i64 0)), !dbg !309
  %14 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @"outcome==1||outcome==2", i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"VaultError::InvalidOutcome", i64 0, i64 0)), !dbg !310
  %15 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @"shares_minor>0", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !311
  %16 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"payout_minor>=min_payout_minor", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !312
  %17 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"ctx.accounts.market.outcome==0", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::MarketNotOpen", i64 0, i64 0)), !dbg !313
  %18 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([71 x i8], [71 x i8]* @"ctx.accounts.quote_authority.key()==ctx.accounts.config.quote_authority", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::NotAuthorized", i64 0, i64 0)), !dbg !314
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @pos, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @ctx.accounts.position, i64 0, i64 0)), !dbg !315
  %19 = call i8* @"sol.=="(i8* %1, i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"1", i64 0, i64 0)), !dbg !316
  %20 = call i8* @sol.if(i8* %19), !dbg !317
  %21 = call i8* @"sol.lib::sell_position.anon.1"(i8* %20), !dbg !318
  %22 = call i8* @sol.ifTrue.anon.(i8* %21), !dbg !318
  %23 = call i8* @"sol.lib::sell_position.anon.2"(i8* %22), !dbg !319
  %24 = call i8* @sol.ifFalse.anon.(i8* %23), !dbg !319
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0), i8* getelementptr inbounds ([80 x i8], [80 x i8]* @"[&[Market::SEED,ctx.accounts.market.uuid.as_ref(),&[ctx.accounts.market.bump],]]", i64 0, i64 0)), !dbg !320
  %25 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([29 x i8], [29 x i8]* @ctx.accounts.market_vault_ata, i64 0, i64 0)), !dbg !321
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* %25), !dbg !322
  %26 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.user_usdc_ata, i64 0, i64 0)), !dbg !323
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* %26), !dbg !324
  %27 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @ctx.accounts.market, i64 0, i64 0)), !dbg !325
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* %27), !dbg !326
  %28 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.usdc_mint, i64 0, i64 0)), !dbg !327
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0), i8* %28), !dbg !328
  %29 = call i8* @sol.model.struct.new.TransferChecked.4(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0)), !dbg !329
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* %29), !dbg !330
  %30 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.token_program, i64 0, i64 0)), !dbg !331
  %31 = call i8* @"sol.CpiContext::new_with_signer.3"(i8* %30, i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0)), !dbg !332
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %31), !dbg !333
  %32 = call i8* @"sol.token::transfer_checked.3"(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %3, i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"6", i64 0, i64 0)), !dbg !334
  %33 = call i8* @"sol.emit.!2"(i8* getelementptr inbounds ([41 x i8], [41 x i8]* @"PositionSold{user:ctx.accounts.user.key()", i64 0, i64 0), i8* getelementptr inbounds ([85 x i8], [85 x i8]* @"market:ctx.accounts.market.key(),outcome,shares_minor,payout_minor,timestamp:now_ts,}", i64 0, i64 0)), !dbg !335
  %34 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !336
  ret i8* %0, !dbg !306
}

define i8* @"lib::resolve_market.2"(i8* %0, i8* %1) !dbg !337 {
  %3 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([22 x i8], [22 x i8]* @"Context<ResolveMarket>", i64 0, i64 0)), !dbg !338
  %4 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @u8, i64 0, i64 0)), !dbg !338
  %5 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([34 x i8], [34 x i8]* @"outcome==1||outcome==2||outcome==3", i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"VaultError::InvalidOutcome", i64 0, i64 0)), !dbg !340
  %6 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([59 x i8], [59 x i8]* @"ctx.accounts.authority.key()==ctx.accounts.config.authority", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::NotAuthorized", i64 0, i64 0)), !dbg !341
  %7 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"ctx.accounts.market.outcome==0", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::MarketNotOpen", i64 0, i64 0)), !dbg !342
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([27 x i8], [27 x i8]* @ctx.accounts.market.outcome, i64 0, i64 0), i8* %1), !dbg !343
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @now_ts, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Clock::get()?.unix_timestamp", i64 0, i64 0)), !dbg !344
  %8 = call i8* @"sol.emit.!2"(i8* getelementptr inbounds ([47 x i8], [47 x i8]* @"MarketResolved{market:ctx.accounts.market.key()", i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"outcome,timestamp:now_ts,}", i64 0, i64 0)), !dbg !345
  %9 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !346
  ret i8* %0, !dbg !338
}

define i8* @"lib::claim_winnings.anon.1"(i8* %0) !dbg !347 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !348
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([1 x i8], [1 x i8]* @s, i64 0, i64 0), i8* getelementptr inbounds ([14 x i8], [14 x i8]* @pos.shares_yes, i64 0, i64 0)), !dbg !350
  %3 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"s>0", i64 0, i64 0), i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"VaultError::NoWinningPosition", i64 0, i64 0)), !dbg !351
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @pos.shares_yes, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !352
  ret i8* %0, !dbg !348
}

define i8* @"lib::claim_winnings.anon.2"(i8* %0) !dbg !353 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !354
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([1 x i8], [1 x i8]* @s, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @pos.shares_no, i64 0, i64 0)), !dbg !356
  %3 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"s>0", i64 0, i64 0), i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"VaultError::NoWinningPosition", i64 0, i64 0)), !dbg !357
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @pos.shares_no, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !358
  ret i8* %0, !dbg !354
}

define i8* @"lib::claim_winnings.2"(i8* %0, i8* %1) !dbg !359 {
  %3 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([22 x i8], [22 x i8]* @"Context<ClaimWinnings>", i64 0, i64 0)), !dbg !360
  %4 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @min_payout_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !360
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([27 x i8], [27 x i8]* @ctx.accounts.market.outcome, i64 0, i64 0)), !dbg !362
  %5 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @"outcome==1||outcome==2", i64 0, i64 0), i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"VaultError::MarketNotResolved", i64 0, i64 0)), !dbg !363
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @pos, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @ctx.accounts.position, i64 0, i64 0)), !dbg !364
  %6 = call i8* @"sol.=="(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"1", i64 0, i64 0)), !dbg !365
  %7 = call i8* @sol.if(i8* %6), !dbg !366
  %8 = call i8* @"sol.lib::claim_winnings.anon.1"(i8* %7), !dbg !367
  %9 = call i8* @sol.ifTrue.anon.(i8* %8), !dbg !367
  %10 = call i8* @"sol.lib::claim_winnings.anon.2"(i8* %9), !dbg !368
  %11 = call i8* @sol.ifFalse.anon.(i8* %10), !dbg !368
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0), i8* %11), !dbg !369
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @payout_minor, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !370
  %12 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"payout_minor>=min_payout_minor", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !371
  %13 = call i8* @sol.checked_add.2(i8* getelementptr inbounds ([33 x i8], [33 x i8]* @ctx.accounts.market.total_claimed, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @payout_minor, i64 0, i64 0)), !dbg !372
  %14 = call i8* @sol.ok_or.2(i8* %13, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !373
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([33 x i8], [33 x i8]* @ctx.accounts.market.total_claimed, i64 0, i64 0), i8* %14), !dbg !374
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0), i8* getelementptr inbounds ([80 x i8], [80 x i8]* @"[&[Market::SEED,ctx.accounts.market.uuid.as_ref(),&[ctx.accounts.market.bump],]]", i64 0, i64 0)), !dbg !375
  %15 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([29 x i8], [29 x i8]* @ctx.accounts.market_vault_ata, i64 0, i64 0)), !dbg !376
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* %15), !dbg !377
  %16 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.user_usdc_ata, i64 0, i64 0)), !dbg !378
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* %16), !dbg !379
  %17 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @ctx.accounts.market, i64 0, i64 0)), !dbg !380
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* %17), !dbg !381
  %18 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.usdc_mint, i64 0, i64 0)), !dbg !382
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0), i8* %18), !dbg !383
  %19 = call i8* @sol.model.struct.new.TransferChecked.4(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0)), !dbg !384
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* %19), !dbg !385
  %20 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.token_program, i64 0, i64 0)), !dbg !386
  %21 = call i8* @"sol.CpiContext::new_with_signer.3"(i8* %20, i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0)), !dbg !387
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %21), !dbg !388
  %22 = call i8* @"sol.token::transfer_checked.3"(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @payout_minor, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"6", i64 0, i64 0)), !dbg !389
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @now_ts, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Clock::get()?.unix_timestamp", i64 0, i64 0)), !dbg !390
  %23 = call i8* @"sol.emit.!2"(i8* getelementptr inbounds ([44 x i8], [44 x i8]* @"WinningsClaimed{user:ctx.accounts.user.key()", i64 0, i64 0), i8* getelementptr inbounds ([85 x i8], [85 x i8]* @"market:ctx.accounts.market.key(),outcome,shares_minor,payout_minor,timestamp:now_ts,}", i64 0, i64 0)), !dbg !391
  %24 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !392
  ret i8* %0, !dbg !360
}

define i8* @"lib::collect_fees.anon.1"(i8* %0) !dbg !393 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !394
  ret i8* %0, !dbg !394
}

define i8* @"lib::collect_fees.anon.2"(i8* %0) !dbg !396 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !397
  ret i8* %0, !dbg !397
}

define i8* @"lib::collect_fees.anon.3"(i8* %0) !dbg !399 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !400
  %3 = call i8* @sol.checked_add.2(i8* getelementptr inbounds ([25 x i8], [25 x i8]* @ctx.accounts.market.q_yes, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @ctx.accounts.market.q_no, i64 0, i64 0)), !dbg !402
  %4 = call i8* @sol.ok_or.2(i8* %3, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !403
  ret i8* %0, !dbg !400
}

define i8* @"lib::collect_fees.2"(i8* %0, i8* %1) !dbg !404 {
  %3 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"Context<CollectFees>", i64 0, i64 0)), !dbg !405
  %4 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @amount_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !405
  %5 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @"amount_minor>0", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !407
  %6 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([59 x i8], [59 x i8]* @"ctx.accounts.authority.key()==ctx.accounts.config.authority", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::NotAuthorized", i64 0, i64 0)), !dbg !408
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([27 x i8], [27 x i8]* @ctx.accounts.market.outcome, i64 0, i64 0)), !dbg !409
  %7 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @"outcome>0", i64 0, i64 0), i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"VaultError::MarketNotResolved", i64 0, i64 0)), !dbg !410
  %8 = call i8* @"sol.=="(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"1", i64 0, i64 0)), !dbg !411
  %9 = call i8* @sol.if(i8* %8), !dbg !412
  %10 = call i8* @"sol.lib::collect_fees.anon.1"(i8* %9), !dbg !413
  %11 = call i8* @sol.ifTrue.anon.(i8* %10), !dbg !413
  %12 = call i8* @"sol.=="(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @outcome, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"2", i64 0, i64 0)), !dbg !414
  %13 = call i8* @sol.if(i8* %12), !dbg !415
  %14 = call i8* @"sol.lib::collect_fees.anon.2"(i8* %13), !dbg !416
  %15 = call i8* @sol.ifTrue.anon.(i8* %14), !dbg !416
  %16 = call i8* @"sol.lib::collect_fees.anon.3"(i8* %15), !dbg !417
  %17 = call i8* @sol.ifFalse.anon.(i8* %16), !dbg !417
  %18 = call i8* @sol.ifTrueFalse.anon.(i8* %11, i8* %17), !dbg !415
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @liability_shares, i64 0, i64 0), i8* %18), !dbg !418
  %19 = call i8* @sol.checked_sub.2(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @liability_shares, i64 0, i64 0), i8* getelementptr inbounds ([33 x i8], [33 x i8]* @ctx.accounts.market.total_claimed, i64 0, i64 0)), !dbg !419
  %20 = call i8* @sol.unwrap_or.2(i8* %19, i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !420
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @remaining_liability, i64 0, i64 0), i8* %20), !dbg !421
  %21 = call i8* @sol.checked_sub.2(i8* getelementptr inbounds ([36 x i8], [36 x i8]* @ctx.accounts.market_vault_ata.amount, i64 0, i64 0), i8* getelementptr inbounds ([19 x i8], [19 x i8]* @remaining_liability, i64 0, i64 0)), !dbg !422
  %22 = call i8* @sol.ok_or.2(i8* %21, i8* getelementptr inbounds ([31 x i8], [31 x i8]* @"VaultError::InsufficientBalance", i64 0, i64 0)), !dbg !423
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([15 x i8], [15 x i8]* @max_collectible, i64 0, i64 0), i8* %22), !dbg !424
  %23 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"amount_minor<=max_collectible", i64 0, i64 0), i8* getelementptr inbounds ([31 x i8], [31 x i8]* @"VaultError::InsufficientBalance", i64 0, i64 0)), !dbg !425
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0), i8* getelementptr inbounds ([80 x i8], [80 x i8]* @"[&[Market::SEED,ctx.accounts.market.uuid.as_ref(),&[ctx.accounts.market.bump],]]", i64 0, i64 0)), !dbg !426
  %24 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([29 x i8], [29 x i8]* @ctx.accounts.market_vault_ata, i64 0, i64 0)), !dbg !427
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* %24), !dbg !428
  %25 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @ctx.accounts.fee_recipient_ata, i64 0, i64 0)), !dbg !429
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* %25), !dbg !430
  %26 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @ctx.accounts.market, i64 0, i64 0)), !dbg !431
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* %26), !dbg !432
  %27 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.usdc_mint, i64 0, i64 0)), !dbg !433
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0), i8* %27), !dbg !434
  %28 = call i8* @sol.model.struct.new.TransferChecked.4(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0)), !dbg !435
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* %28), !dbg !436
  %29 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.token_program, i64 0, i64 0)), !dbg !437
  %30 = call i8* @"sol.CpiContext::new_with_signer.3"(i8* %29, i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0)), !dbg !438
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %30), !dbg !439
  %31 = call i8* @"sol.token::transfer_checked.3"(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %1, i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"6", i64 0, i64 0)), !dbg !440
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @now_ts, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Clock::get()?.unix_timestamp", i64 0, i64 0)), !dbg !441
  %32 = call i8* @"sol.emit.!2"(i8* getelementptr inbounds ([46 x i8], [46 x i8]* @"FeesCollected{market:ctx.accounts.market.key()", i64 0, i64 0), i8* getelementptr inbounds ([70 x i8], [70 x i8]* @"authority:ctx.accounts.authority.key(),amount_minor,timestamp:now_ts,}", i64 0, i64 0)), !dbg !442
  %33 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !443
  ret i8* %0, !dbg !405
}

define i8* @"lib::refund_cancelled.2"(i8* %0, i8* %1) !dbg !444 {
  %3 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Context<RefundCancelled>", i64 0, i64 0)), !dbg !445
  %4 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @min_payout_minor, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @u64, i64 0, i64 0)), !dbg !445
  %5 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"ctx.accounts.market.outcome==3", i64 0, i64 0), i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"VaultError::MarketNotResolved", i64 0, i64 0)), !dbg !447
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @pos, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @ctx.accounts.position, i64 0, i64 0)), !dbg !448
  %6 = call i8* @sol.checked_add.2(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @pos.shares_yes, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @pos.shares_no, i64 0, i64 0)), !dbg !449
  %7 = call i8* @sol.ok_or.2(i8* %6, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !450
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0), i8* %7), !dbg !451
  %8 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @"shares_minor>0", i64 0, i64 0), i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"VaultError::NoWinningPosition", i64 0, i64 0)), !dbg !452
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @pos.shares_yes, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !453
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @pos.shares_no, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"0", i64 0, i64 0)), !dbg !454
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @payout_minor, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @shares_minor, i64 0, i64 0)), !dbg !455
  %9 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"payout_minor>=min_payout_minor", i64 0, i64 0), i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"VaultError::InvalidAmount", i64 0, i64 0)), !dbg !456
  %10 = call i8* @sol.checked_add.2(i8* getelementptr inbounds ([33 x i8], [33 x i8]* @ctx.accounts.market.total_claimed, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @payout_minor, i64 0, i64 0)), !dbg !457
  %11 = call i8* @sol.ok_or.2(i8* %10, i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::ArithmeticOverflow", i64 0, i64 0)), !dbg !458
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([33 x i8], [33 x i8]* @ctx.accounts.market.total_claimed, i64 0, i64 0), i8* %11), !dbg !459
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0), i8* getelementptr inbounds ([80 x i8], [80 x i8]* @"[&[Market::SEED,ctx.accounts.market.uuid.as_ref(),&[ctx.accounts.market.bump],]]", i64 0, i64 0)), !dbg !460
  %12 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([29 x i8], [29 x i8]* @ctx.accounts.market_vault_ata, i64 0, i64 0)), !dbg !461
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* %12), !dbg !462
  %13 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.user_usdc_ata, i64 0, i64 0)), !dbg !463
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* %13), !dbg !464
  %14 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([19 x i8], [19 x i8]* @ctx.accounts.market, i64 0, i64 0)), !dbg !465
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* %14), !dbg !466
  %15 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([22 x i8], [22 x i8]* @ctx.accounts.usdc_mint, i64 0, i64 0)), !dbg !467
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0), i8* %15), !dbg !468
  %16 = call i8* @sol.model.struct.new.TransferChecked.4(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @from, i64 0, i64 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @to, i64 0, i64 0), i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([4 x i8], [4 x i8]* @mint, i64 0, i64 0)), !dbg !469
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* %16), !dbg !470
  %17 = call i8* @sol.to_account_info.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @ctx.accounts.token_program, i64 0, i64 0)), !dbg !471
  %18 = call i8* @"sol.CpiContext::new_with_signer.3"(i8* %17, i8* getelementptr inbounds ([12 x i8], [12 x i8]* @cpi_accounts, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @signer_seeds, i64 0, i64 0)), !dbg !472
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* %18), !dbg !473
  %19 = call i8* @"sol.token::transfer_checked.3"(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @cpi_ctx, i64 0, i64 0), i8* getelementptr inbounds ([12 x i8], [12 x i8]* @payout_minor, i64 0, i64 0), i8* getelementptr inbounds ([1 x i8], [1 x i8]* @"6", i64 0, i64 0)), !dbg !474
  %20 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !475
  ret i8* %0, !dbg !445
}

define i8* @"lib::close_position.1"(i8* %0) !dbg !476 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @ctx, i64 0, i64 0), i8* getelementptr inbounds ([22 x i8], [22 x i8]* @"Context<ClosePosition>", i64 0, i64 0)), !dbg !477
  call void @sol.model.opaqueAssign(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @pos, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @ctx.accounts.position, i64 0, i64 0)), !dbg !479
  %3 = call i8* @"sol.require.!2"(i8* getelementptr inbounds ([35 x i8], [35 x i8]* @"pos.shares_yes==0&&pos.shares_no==0", i64 0, i64 0), i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"VaultError::InsufficientShares", i64 0, i64 0)), !dbg !480
  %4 = call i8* @sol.Ok.1(i8* getelementptr inbounds ([2 x i8], [2 x i8]* @"()", i64 0, i64 0)), !dbg !481
  ret i8* %0, !dbg !477
}

define i8* @sol.model.anchor.program.prediction_market_vault(i8* %0) !dbg !482 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !483
  %3 = call i8* @sol.initialize_config.2(i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"ctx:Context<InitializeConfig>", i64 0, i64 0), i8* getelementptr inbounds ([22 x i8], [22 x i8]* @"quote_authority:Pubkey", i64 0, i64 0)), !dbg !485
  %4 = call i8* @sol.set_pending_authority.2(i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"ctx:Context<SetPendingAuthority>", i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"new_authority:Pubkey", i64 0, i64 0)), !dbg !486
  %5 = call i8* @sol.cancel_authority_transfer.1(i8* getelementptr inbounds ([36 x i8], [36 x i8]* @"ctx:Context<CancelAuthorityTransfer>", i64 0, i64 0)), !dbg !487
  %6 = call i8* @sol.accept_authority_transfer.1(i8* getelementptr inbounds ([36 x i8], [36 x i8]* @"ctx:Context<AcceptAuthorityTransfer>", i64 0, i64 0)), !dbg !488
  %7 = call i8* @sol.create_market.2(i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"ctx:Context<CreateMarket>", i64 0, i64 0), i8* getelementptr inbounds ([19 x i8], [19 x i8]* @"market_uuid:[u8;16]", i64 0, i64 0)), !dbg !489
  %8 = call i8* @sol.deposit.2(i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"ctx:Context<Deposit>", i64 0, i64 0), i8* getelementptr inbounds ([16 x i8], [16 x i8]* @"amount_minor:u64", i64 0, i64 0)), !dbg !490
  %9 = call i8* @sol.withdraw.2(i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"ctx:Context<Withdraw>", i64 0, i64 0), i8* getelementptr inbounds ([16 x i8], [16 x i8]* @"amount_minor:u64", i64 0, i64 0)), !dbg !491
  %10 = call i8* @sol.place_bet.6(i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"ctx:Context<PlaceBet>", i64 0, i64 0), i8* getelementptr inbounds ([10 x i8], [10 x i8]* @"outcome:u8", i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"collateral_minor:u64", i64 0, i64 0), i8* getelementptr inbounds ([16 x i8], [16 x i8]* @"shares_minor:u64", i64 0, i64 0), i8* getelementptr inbounds ([18 x i8], [18 x i8]* @"max_cost_minor:u64", i64 0, i64 0), i8* getelementptr inbounds ([15 x i8], [15 x i8]* @"deadline_ts:i64", i64 0, i64 0)), !dbg !492
  %11 = call i8* @sol.sell_position.6(i8* getelementptr inbounds ([25 x i8], [25 x i8]* @"ctx:Context<SellPosition>", i64 0, i64 0), i8* getelementptr inbounds ([10 x i8], [10 x i8]* @"outcome:u8", i64 0, i64 0), i8* getelementptr inbounds ([16 x i8], [16 x i8]* @"shares_minor:u64", i64 0, i64 0), i8* getelementptr inbounds ([16 x i8], [16 x i8]* @"payout_minor:u64", i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"min_payout_minor:u64", i64 0, i64 0), i8* getelementptr inbounds ([15 x i8], [15 x i8]* @"deadline_ts:i64", i64 0, i64 0)), !dbg !493
  %12 = call i8* @sol.resolve_market.2(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"ctx:Context<ResolveMarket>", i64 0, i64 0), i8* getelementptr inbounds ([10 x i8], [10 x i8]* @"outcome:u8", i64 0, i64 0)), !dbg !494
  %13 = call i8* @sol.claim_winnings.2(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"ctx:Context<ClaimWinnings>", i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"min_payout_minor:u64", i64 0, i64 0)), !dbg !495
  %14 = call i8* @sol.collect_fees.2(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"ctx:Context<CollectFees>", i64 0, i64 0), i8* getelementptr inbounds ([16 x i8], [16 x i8]* @"amount_minor:u64", i64 0, i64 0)), !dbg !496
  %15 = call i8* @sol.refund_cancelled.2(i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"ctx:Context<RefundCancelled>", i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"min_payout_minor:u64", i64 0, i64 0)), !dbg !497
  %16 = call i8* @sol.close_position.1(i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"ctx:Context<ClosePosition>", i64 0, i64 0)), !dbg !498
  ret i8* %0, !dbg !483
}

define i8* @main(i8* %0) !dbg !499 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !500
  %3 = call i8* @sol.model.anchor.program.prediction_market_vault(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @program_id, i64 0, i64 0)), !dbg !500
  ret i8* %0, !dbg !500
}

define i8* @sol.model.struct.anchor.InitializeConfig(i8* %0) !dbg !502 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !503
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !505
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !506
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([67 x i8], [67 x i8]* @"constraint=program.programdata_address()?==Some(program_data.key())", i64 0, i64 0)), !dbg !507
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([7 x i8], [7 x i8]* @program, i64 0, i64 0), i8* getelementptr inbounds ([36 x i8], [36 x i8]* @"Program<'info,PredictionMarketVault>", i64 0, i64 0)), !dbg !508
  %7 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @program_data, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Account<'info,ProgramData>", i64 0, i64 0)), !dbg !509
  %8 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([73 x i8], [73 x i8]* @"init,payer=authority,space=8+Config::INIT_SPACE,seeds=[Config::SEED],bump", i64 0, i64 0)), !dbg !510
  %9 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !511
  %10 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Box<Account<'info,Mint>>", i64 0, i64 0)), !dbg !512
  %11 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @system_program, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"Program<'info,System>", i64 0, i64 0)), !dbg !513
  ret i8* %0, !dbg !503
}

define i8* @sol.model.struct.anchor.SetPendingAuthority(i8* %0) !dbg !514 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !515
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !517
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !518
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !519
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !520
  %7 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([105 x i8], [105 x i8]* @"init_if_needed,payer=authority,space=8+AuthorityTransfer::INIT_SPACE,seeds=[AuthorityTransfer::SEED],bump", i64 0, i64 0)), !dbg !521
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([18 x i8], [18 x i8]* @authority_transfer, i64 0, i64 0), i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"Box<Account<'info,AuthorityTransfer>>", i64 0, i64 0)), !dbg !522
  %9 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @system_program, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"Program<'info,System>", i64 0, i64 0)), !dbg !523
  ret i8* %0, !dbg !515
}

define i8* @sol.model.struct.anchor.CancelAuthorityTransfer(i8* %0) !dbg !524 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !525
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !527
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !528
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !529
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !530
  %7 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([80 x i8], [80 x i8]* @"mut,close=authority,seeds=[AuthorityTransfer::SEED],bump=authority_transfer.bump", i64 0, i64 0)), !dbg !531
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([18 x i8], [18 x i8]* @authority_transfer, i64 0, i64 0), i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"Box<Account<'info,AuthorityTransfer>>", i64 0, i64 0)), !dbg !532
  ret i8* %0, !dbg !525
}

define i8* @sol.model.struct.anchor.AcceptAuthorityTransfer(i8* %0) !dbg !533 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !534
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !536
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @new_authority, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !537
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([41 x i8], [41 x i8]* @"mut,seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !538
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !539
  %7 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([84 x i8], [84 x i8]* @"mut,close=new_authority,seeds=[AuthorityTransfer::SEED],bump=authority_transfer.bump", i64 0, i64 0)), !dbg !540
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([18 x i8], [18 x i8]* @authority_transfer, i64 0, i64 0), i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"Box<Account<'info,AuthorityTransfer>>", i64 0, i64 0)), !dbg !541
  ret i8* %0, !dbg !534
}

define i8* @sol.model.struct.anchor.CreateMarket(i8* %0) !dbg !542 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !543
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !545
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([5 x i8], [5 x i8]* @payer, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !546
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([90 x i8], [90 x i8]* @"init,payer=payer,space=8+Market::INIT_SPACE,seeds=[Market::SEED,market_uuid.as_ref()],bump", i64 0, i64 0)), !dbg !547
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @market, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Market>>", i64 0, i64 0)), !dbg !548
  %7 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([124 x i8], [124 x i8]* @"init_if_needed,payer=payer,space=8+UserMarketCreation::INIT_SPACE,seeds=[UserMarketCreation::SEED,payer.key().as_ref()],bump", i64 0, i64 0)), !dbg !549
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([20 x i8], [20 x i8]* @user_market_creation, i64 0, i64 0), i8* getelementptr inbounds ([38 x i8], [38 x i8]* @"Box<Account<'info,UserMarketCreation>>", i64 0, i64 0)), !dbg !550
  %9 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !551
  %10 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !552
  %11 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([71 x i8], [71 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=payer,", i64 0, i64 0)), !dbg !553
  %12 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @payer_usdc_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !554
  %13 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([154 x i8], [154 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=config,constraint=fee_recipient_ata.key()!=payer_usdc_ata.key()@VaultError::InvalidAmount", i64 0, i64 0)), !dbg !555
  %14 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([17 x i8], [17 x i8]* @fee_recipient_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !556
  %15 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([69 x i8], [69 x i8]* @"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch", i64 0, i64 0)), !dbg !557
  %16 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Box<Account<'info,Mint>>", i64 0, i64 0)), !dbg !558
  %17 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @token_program, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"Program<'info,Token>", i64 0, i64 0)), !dbg !559
  %18 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @associated_token_program, i64 0, i64 0), i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"Program<'info,AssociatedToken>", i64 0, i64 0)), !dbg !560
  %19 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @system_program, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"Program<'info,System>", i64 0, i64 0)), !dbg !561
  ret i8* %0, !dbg !543
}

define i8* @sol.model.struct.anchor.Deposit(i8* %0) !dbg !562 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !563
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !565
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !566
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !567
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !568
  %7 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([69 x i8], [69 x i8]* @"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch", i64 0, i64 0)), !dbg !569
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Box<Account<'info,Mint>>", i64 0, i64 0)), !dbg !570
  %9 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([104 x i8], [104 x i8]* @"init_if_needed,payer=user,space=8+UserVault::INIT_SPACE,seeds=[UserVault::SEED,user.key().as_ref()],bump", i64 0, i64 0)), !dbg !571
  %10 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @user_vault, i64 0, i64 0), i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"Box<Account<'info,UserVault>>", i64 0, i64 0)), !dbg !572
  %11 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([70 x i8], [70 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=user,", i64 0, i64 0)), !dbg !573
  %12 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @user_usdc_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !574
  %13 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([150 x i8], [150 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=config,constraint=vault_usdc_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount", i64 0, i64 0)), !dbg !575
  %14 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @vault_usdc_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !576
  %15 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @token_program, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"Program<'info,Token>", i64 0, i64 0)), !dbg !577
  %16 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @associated_token_program, i64 0, i64 0), i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"Program<'info,AssociatedToken>", i64 0, i64 0)), !dbg !578
  %17 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @system_program, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"Program<'info,System>", i64 0, i64 0)), !dbg !579
  ret i8* %0, !dbg !563
}

define i8* @sol.model.struct.anchor.Withdraw(i8* %0) !dbg !580 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !581
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !583
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !584
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !585
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !586
  %7 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([69 x i8], [69 x i8]* @"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch", i64 0, i64 0)), !dbg !587
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Box<Account<'info,Mint>>", i64 0, i64 0)), !dbg !588
  %9 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([133 x i8], [133 x i8]* @"mut,seeds=[UserVault::SEED,user.key().as_ref()],bump=user_vault.bump,constraint=user_vault.user==user.key()@VaultError::NotAuthorized", i64 0, i64 0)), !dbg !589
  %10 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([10 x i8], [10 x i8]* @user_vault, i64 0, i64 0), i8* getelementptr inbounds ([29 x i8], [29 x i8]* @"Box<Account<'info,UserVault>>", i64 0, i64 0)), !dbg !590
  %11 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([70 x i8], [70 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=user,", i64 0, i64 0)), !dbg !591
  %12 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @user_usdc_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !592
  %13 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([150 x i8], [150 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=config,constraint=vault_usdc_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount", i64 0, i64 0)), !dbg !593
  %14 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @vault_usdc_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !594
  %15 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @token_program, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"Program<'info,Token>", i64 0, i64 0)), !dbg !595
  ret i8* %0, !dbg !581
}

define i8* @sol.model.struct.anchor.PlaceBet(i8* %0) !dbg !596 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !597
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !599
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !600
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([15 x i8], [15 x i8]* @quote_authority, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !601
  %6 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !602
  %7 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !603
  %8 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([62 x i8], [62 x i8]* @"mut,seeds=[Market::SEED,market.uuid.as_ref()],bump=market.bump", i64 0, i64 0)), !dbg !604
  %9 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @market, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Market>>", i64 0, i64 0)), !dbg !605
  %10 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([124 x i8], [124 x i8]* @"init_if_needed,payer=user,space=8+Position::INIT_SPACE,seeds=[Position::SEED,market.key().as_ref(),user.key().as_ref()],bump", i64 0, i64 0)), !dbg !606
  %11 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @position, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Box<Account<'info,Position>>", i64 0, i64 0)), !dbg !607
  %12 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([69 x i8], [69 x i8]* @"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch", i64 0, i64 0)), !dbg !608
  %13 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Box<Account<'info,Mint>>", i64 0, i64 0)), !dbg !609
  %14 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([70 x i8], [70 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=user,", i64 0, i64 0)), !dbg !610
  %15 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @user_usdc_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !611
  %16 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([152 x i8], [152 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=market,constraint=market_vault_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount", i64 0, i64 0)), !dbg !612
  %17 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @market_vault_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !613
  %18 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @token_program, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"Program<'info,Token>", i64 0, i64 0)), !dbg !614
  %19 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @associated_token_program, i64 0, i64 0), i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"Program<'info,AssociatedToken>", i64 0, i64 0)), !dbg !615
  %20 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @system_program, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"Program<'info,System>", i64 0, i64 0)), !dbg !616
  ret i8* %0, !dbg !597
}

define i8* @sol.model.struct.anchor.SellPosition(i8* %0) !dbg !617 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !618
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !620
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !621
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([15 x i8], [15 x i8]* @quote_authority, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !622
  %6 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !623
  %7 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !624
  %8 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([62 x i8], [62 x i8]* @"mut,seeds=[Market::SEED,market.uuid.as_ref()],bump=market.bump", i64 0, i64 0)), !dbg !625
  %9 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @market, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Market>>", i64 0, i64 0)), !dbg !626
  %10 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([150 x i8], [150 x i8]* @"mut,seeds=[Position::SEED,market.key().as_ref(),user.key().as_ref()],bump=position.bump,constraint=position.user==user.key()@VaultError::NotAuthorized", i64 0, i64 0)), !dbg !627
  %11 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @position, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Box<Account<'info,Position>>", i64 0, i64 0)), !dbg !628
  %12 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([69 x i8], [69 x i8]* @"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch", i64 0, i64 0)), !dbg !629
  %13 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Box<Account<'info,Mint>>", i64 0, i64 0)), !dbg !630
  %14 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([70 x i8], [70 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=user,", i64 0, i64 0)), !dbg !631
  %15 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @user_usdc_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !632
  %16 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([152 x i8], [152 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=market,constraint=market_vault_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount", i64 0, i64 0)), !dbg !633
  %17 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @market_vault_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !634
  %18 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @token_program, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"Program<'info,Token>", i64 0, i64 0)), !dbg !635
  ret i8* %0, !dbg !618
}

define i8* @sol.model.struct.anchor.ResolveMarket(i8* %0) !dbg !636 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !637
  %3 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !639
  %4 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !640
  %5 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !641
  %6 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([62 x i8], [62 x i8]* @"mut,seeds=[Market::SEED,market.uuid.as_ref()],bump=market.bump", i64 0, i64 0)), !dbg !642
  %7 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @market, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Market>>", i64 0, i64 0)), !dbg !643
  ret i8* %0, !dbg !637
}

define i8* @sol.model.struct.anchor.ClaimWinnings(i8* %0) !dbg !644 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !645
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !647
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !648
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !649
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !650
  %7 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([62 x i8], [62 x i8]* @"mut,seeds=[Market::SEED,market.uuid.as_ref()],bump=market.bump", i64 0, i64 0)), !dbg !651
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @market, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Market>>", i64 0, i64 0)), !dbg !652
  %9 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([150 x i8], [150 x i8]* @"mut,seeds=[Position::SEED,market.key().as_ref(),user.key().as_ref()],bump=position.bump,constraint=position.user==user.key()@VaultError::NotAuthorized", i64 0, i64 0)), !dbg !653
  %10 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @position, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Box<Account<'info,Position>>", i64 0, i64 0)), !dbg !654
  %11 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([69 x i8], [69 x i8]* @"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch", i64 0, i64 0)), !dbg !655
  %12 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Box<Account<'info,Mint>>", i64 0, i64 0)), !dbg !656
  %13 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([70 x i8], [70 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=user,", i64 0, i64 0)), !dbg !657
  %14 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @user_usdc_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !658
  %15 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([152 x i8], [152 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=market,constraint=market_vault_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount", i64 0, i64 0)), !dbg !659
  %16 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @market_vault_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !660
  %17 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @token_program, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"Program<'info,Token>", i64 0, i64 0)), !dbg !661
  ret i8* %0, !dbg !645
}

define i8* @sol.model.struct.anchor.CollectFees(i8* %0) !dbg !662 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !663
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !665
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @authority, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !666
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !667
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !668
  %7 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([62 x i8], [62 x i8]* @"mut,seeds=[Market::SEED,market.uuid.as_ref()],bump=market.bump", i64 0, i64 0)), !dbg !669
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @market, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Market>>", i64 0, i64 0)), !dbg !670
  %9 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([74 x i8], [74 x i8]* @"constraint=fee_recipient.key()==config.authority@VaultError::NotAuthorized", i64 0, i64 0)), !dbg !671
  %10 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @fee_recipient, i64 0, i64 0), i8* getelementptr inbounds ([23 x i8], [23 x i8]* @"UncheckedAccount<'info>", i64 0, i64 0)), !dbg !672
  %11 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([69 x i8], [69 x i8]* @"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch", i64 0, i64 0)), !dbg !673
  %12 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Box<Account<'info,Mint>>", i64 0, i64 0)), !dbg !674
  %13 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([72 x i8], [72 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=market,", i64 0, i64 0)), !dbg !675
  %14 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @market_vault_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !676
  %15 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([163 x i8], [163 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=fee_recipient,constraint=fee_recipient_ata.key()!=market_vault_ata.key()@VaultError::InvalidAmount", i64 0, i64 0)), !dbg !677
  %16 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([17 x i8], [17 x i8]* @fee_recipient_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !678
  %17 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @token_program, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"Program<'info,Token>", i64 0, i64 0)), !dbg !679
  %18 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([24 x i8], [24 x i8]* @associated_token_program, i64 0, i64 0), i8* getelementptr inbounds ([30 x i8], [30 x i8]* @"Program<'info,AssociatedToken>", i64 0, i64 0)), !dbg !680
  %19 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([14 x i8], [14 x i8]* @system_program, i64 0, i64 0), i8* getelementptr inbounds ([21 x i8], [21 x i8]* @"Program<'info,System>", i64 0, i64 0)), !dbg !681
  ret i8* %0, !dbg !663
}

define i8* @sol.model.struct.anchor.RefundCancelled(i8* %0) !dbg !682 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !683
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !685
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !686
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([37 x i8], [37 x i8]* @"seeds=[Config::SEED],bump=config.bump", i64 0, i64 0)), !dbg !687
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @config, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Config>>", i64 0, i64 0)), !dbg !688
  %7 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([62 x i8], [62 x i8]* @"mut,seeds=[Market::SEED,market.uuid.as_ref()],bump=market.bump", i64 0, i64 0)), !dbg !689
  %8 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([6 x i8], [6 x i8]* @market, i64 0, i64 0), i8* getelementptr inbounds ([26 x i8], [26 x i8]* @"Box<Account<'info,Market>>", i64 0, i64 0)), !dbg !690
  %9 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([150 x i8], [150 x i8]* @"mut,seeds=[Position::SEED,market.key().as_ref(),user.key().as_ref()],bump=position.bump,constraint=position.user==user.key()@VaultError::NotAuthorized", i64 0, i64 0)), !dbg !691
  %10 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @position, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Box<Account<'info,Position>>", i64 0, i64 0)), !dbg !692
  %11 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([69 x i8], [69 x i8]* @"constraint=usdc_mint.key()==config.usdc_mint@VaultError::MintMismatch", i64 0, i64 0)), !dbg !693
  %12 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([9 x i8], [9 x i8]* @usdc_mint, i64 0, i64 0), i8* getelementptr inbounds ([24 x i8], [24 x i8]* @"Box<Account<'info,Mint>>", i64 0, i64 0)), !dbg !694
  %13 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([70 x i8], [70 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=user,", i64 0, i64 0)), !dbg !695
  %14 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @user_usdc_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !696
  %15 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([152 x i8], [152 x i8]* @"mut,associated_token::mint=usdc_mint,associated_token::authority=market,constraint=market_vault_ata.key()!=user_usdc_ata.key()@VaultError::InvalidAmount", i64 0, i64 0)), !dbg !697
  %16 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @market_vault_ata, i64 0, i64 0), i8* getelementptr inbounds ([32 x i8], [32 x i8]* @"Box<Account<'info,TokenAccount>>", i64 0, i64 0)), !dbg !698
  %17 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([13 x i8], [13 x i8]* @token_program, i64 0, i64 0), i8* getelementptr inbounds ([20 x i8], [20 x i8]* @"Program<'info,Token>", i64 0, i64 0)), !dbg !699
  ret i8* %0, !dbg !683
}

define i8* @sol.model.struct.anchor.ClosePosition(i8* %0) !dbg !700 {
  %2 = call i8* @sol.model.funcArg(i8* getelementptr inbounds ([12 x i8], [12 x i8]* @parser.error, i64 0, i64 0), i8* getelementptr inbounds ([3 x i8], [3 x i8]* @"*i8", i64 0, i64 0)), !dbg !701
  %3 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([3 x i8], [3 x i8]* @mut, i64 0, i64 0)), !dbg !703
  %4 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @user, i64 0, i64 0), i8* getelementptr inbounds ([13 x i8], [13 x i8]* @"Signer<'info>", i64 0, i64 0)), !dbg !704
  %5 = call i8* @sol.model.struct.constraint(i8* getelementptr inbounds ([164 x i8], [164 x i8]* @"mut,close=user,seeds=[Position::SEED,position.market.as_ref(),user.key().as_ref()],bump=position.bump,constraint=position.user==user.key()@VaultError::NotAuthorized", i64 0, i64 0)), !dbg !705
  %6 = call i8* @sol.model.struct.field(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @position, i64 0, i64 0), i8* getelementptr inbounds ([28 x i8], [28 x i8]* @"Box<Account<'info,Position>>", i64 0, i64 0)), !dbg !706
  ret i8* %0, !dbg !701
}

!llvm.dbg.cu = !{!0}
!llvm.module.flags = !{!2}

!0 = distinct !DICompileUnit(language: DW_LANG_C, file: !1, producer: "mlir", isOptimized: true, runtimeVersion: 0, emissionKind: FullDebug)
!1 = !DIFile(filename: "LLVMDialectModule", directory: "/")
!2 = !{i32 2, !"Debug Info Version", i32 3}
!3 = distinct !DISubprogram(name: "sol.model.cargo.toml", linkageName: "sol.model.cargo.toml", scope: null, file: !4, type: !5, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!4 = !DIFile(filename: "programs/prediction_market_vault/Cargo.toml", directory: "/workspace")
!5 = !DISubroutineType(types: !6)
!6 = !{}
!7 = !DILocation(line: 0, scope: !8)
!8 = !DILexicalBlockFile(scope: !3, file: !9, discriminator: 0)
!9 = !DIFile(filename: "Cargo.toml", directory: "/workspace")
!10 = !DILocation(line: 0, scope: !11)
!11 = !DILexicalBlockFile(scope: !3, file: !4, discriminator: 0)
!12 = distinct !DISubprogram(name: "sol.model.declare_id.address", linkageName: "sol.model.declare_id.address", scope: null, file: !4, type: !5, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!13 = !DILocation(line: 0, scope: !14)
!14 = !DILexicalBlockFile(scope: !12, file: !15, discriminator: 0)
!15 = !DIFile(filename: "lib.rs", directory: "/workspace")
!16 = !DILocation(line: 0, scope: !17)
!17 = !DILexicalBlockFile(scope: !12, file: !4, discriminator: 0)
!18 = distinct !DISubprogram(name: "sol.model.struct.anchor.Config", linkageName: "sol.model.struct.anchor.Config", scope: null, file: !19, line: 25, type: !5, scopeLine: 25, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!19 = !DIFile(filename: "programs/prediction_market_vault/src/lib.rs", directory: "/workspace")
!20 = !DILocation(line: 25, column: 4, scope: !21)
!21 = !DILexicalBlockFile(scope: !18, file: !19, discriminator: 0)
!22 = !DILocation(line: 27, column: 8, scope: !21)
!23 = !DILocation(line: 29, column: 8, scope: !21)
!24 = !DILocation(line: 31, column: 8, scope: !21)
!25 = !DILocation(line: 32, column: 8, scope: !21)
!26 = distinct !DISubprogram(name: "sol.model.struct.Config", linkageName: "sol.model.struct.Config", scope: null, file: !19, line: 25, type: !5, scopeLine: 25, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!27 = !DILocation(line: 25, column: 4, scope: !28)
!28 = !DILexicalBlockFile(scope: !26, file: !19, discriminator: 0)
!29 = !DILocation(line: 27, column: 8, scope: !28)
!30 = !DILocation(line: 29, column: 8, scope: !28)
!31 = !DILocation(line: 31, column: 8, scope: !28)
!32 = !DILocation(line: 32, column: 8, scope: !28)
!33 = distinct !DISubprogram(name: "sol.model.struct.anchor.AuthorityTransfer", linkageName: "sol.model.struct.anchor.AuthorityTransfer", scope: null, file: !19, line: 41, type: !5, scopeLine: 41, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!34 = !DILocation(line: 41, column: 4, scope: !35)
!35 = !DILexicalBlockFile(scope: !33, file: !19, discriminator: 0)
!36 = !DILocation(line: 43, column: 8, scope: !35)
!37 = !DILocation(line: 44, column: 8, scope: !35)
!38 = distinct !DISubprogram(name: "sol.model.struct.AuthorityTransfer", linkageName: "sol.model.struct.AuthorityTransfer", scope: null, file: !19, line: 41, type: !5, scopeLine: 41, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!39 = !DILocation(line: 41, column: 4, scope: !40)
!40 = !DILexicalBlockFile(scope: !38, file: !19, discriminator: 0)
!41 = !DILocation(line: 43, column: 8, scope: !40)
!42 = !DILocation(line: 44, column: 8, scope: !40)
!43 = distinct !DISubprogram(name: "sol.model.struct.anchor.UserVault", linkageName: "sol.model.struct.anchor.UserVault", scope: null, file: !19, line: 56, type: !5, scopeLine: 56, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!44 = !DILocation(line: 56, column: 4, scope: !45)
!45 = !DILexicalBlockFile(scope: !43, file: !19, discriminator: 0)
!46 = !DILocation(line: 57, column: 8, scope: !45)
!47 = !DILocation(line: 59, column: 8, scope: !45)
!48 = !DILocation(line: 60, column: 8, scope: !45)
!49 = distinct !DISubprogram(name: "sol.model.struct.UserVault", linkageName: "sol.model.struct.UserVault", scope: null, file: !19, line: 56, type: !5, scopeLine: 56, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!50 = !DILocation(line: 56, column: 4, scope: !51)
!51 = !DILexicalBlockFile(scope: !49, file: !19, discriminator: 0)
!52 = !DILocation(line: 57, column: 8, scope: !51)
!53 = !DILocation(line: 59, column: 8, scope: !51)
!54 = !DILocation(line: 60, column: 8, scope: !51)
!55 = distinct !DISubprogram(name: "sol.model.struct.anchor.UserMarketCreation", linkageName: "sol.model.struct.anchor.UserMarketCreation", scope: null, file: !19, line: 69, type: !5, scopeLine: 69, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!56 = !DILocation(line: 69, column: 4, scope: !57)
!57 = !DILexicalBlockFile(scope: !55, file: !19, discriminator: 0)
!58 = !DILocation(line: 70, column: 8, scope: !57)
!59 = !DILocation(line: 71, column: 8, scope: !57)
!60 = !DILocation(line: 72, column: 8, scope: !57)
!61 = distinct !DISubprogram(name: "sol.model.struct.UserMarketCreation", linkageName: "sol.model.struct.UserMarketCreation", scope: null, file: !19, line: 69, type: !5, scopeLine: 69, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!62 = !DILocation(line: 69, column: 4, scope: !63)
!63 = !DILexicalBlockFile(scope: !61, file: !19, discriminator: 0)
!64 = !DILocation(line: 70, column: 8, scope: !63)
!65 = !DILocation(line: 71, column: 8, scope: !63)
!66 = !DILocation(line: 72, column: 8, scope: !63)
!67 = distinct !DISubprogram(name: "sol.model.struct.anchor.Market", linkageName: "sol.model.struct.anchor.Market", scope: null, file: !19, line: 81, type: !5, scopeLine: 81, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!68 = !DILocation(line: 81, column: 4, scope: !69)
!69 = !DILexicalBlockFile(scope: !67, file: !19, discriminator: 0)
!70 = !DILocation(line: 83, column: 8, scope: !69)
!71 = !DILocation(line: 85, column: 8, scope: !69)
!72 = !DILocation(line: 87, column: 8, scope: !69)
!73 = !DILocation(line: 89, column: 8, scope: !69)
!74 = !DILocation(line: 91, column: 8, scope: !69)
!75 = !DILocation(line: 93, column: 8, scope: !69)
!76 = !DILocation(line: 94, column: 8, scope: !69)
!77 = distinct !DISubprogram(name: "sol.model.struct.Market", linkageName: "sol.model.struct.Market", scope: null, file: !19, line: 81, type: !5, scopeLine: 81, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!78 = !DILocation(line: 81, column: 4, scope: !79)
!79 = !DILexicalBlockFile(scope: !77, file: !19, discriminator: 0)
!80 = !DILocation(line: 83, column: 8, scope: !79)
!81 = !DILocation(line: 85, column: 8, scope: !79)
!82 = !DILocation(line: 87, column: 8, scope: !79)
!83 = !DILocation(line: 89, column: 8, scope: !79)
!84 = !DILocation(line: 91, column: 8, scope: !79)
!85 = !DILocation(line: 93, column: 8, scope: !79)
!86 = !DILocation(line: 94, column: 8, scope: !79)
!87 = distinct !DISubprogram(name: "sol.model.struct.anchor.Position", linkageName: "sol.model.struct.anchor.Position", scope: null, file: !19, line: 103, type: !5, scopeLine: 103, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!88 = !DILocation(line: 103, column: 4, scope: !89)
!89 = !DILexicalBlockFile(scope: !87, file: !19, discriminator: 0)
!90 = !DILocation(line: 104, column: 8, scope: !89)
!91 = !DILocation(line: 105, column: 8, scope: !89)
!92 = !DILocation(line: 106, column: 8, scope: !89)
!93 = !DILocation(line: 107, column: 8, scope: !89)
!94 = !DILocation(line: 108, column: 8, scope: !89)
!95 = distinct !DISubprogram(name: "sol.model.struct.Position", linkageName: "sol.model.struct.Position", scope: null, file: !19, line: 103, type: !5, scopeLine: 103, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!96 = !DILocation(line: 103, column: 4, scope: !97)
!97 = !DILexicalBlockFile(scope: !95, file: !19, discriminator: 0)
!98 = !DILocation(line: 104, column: 8, scope: !97)
!99 = !DILocation(line: 105, column: 8, scope: !97)
!100 = !DILocation(line: 106, column: 8, scope: !97)
!101 = !DILocation(line: 107, column: 8, scope: !97)
!102 = !DILocation(line: 108, column: 8, scope: !97)
!103 = distinct !DISubprogram(name: "lib::initialize_config.2", linkageName: "lib::initialize_config.2", scope: null, file: !19, line: 229, type: !5, scopeLine: 229, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!104 = !DILocation(line: 229, column: 8, scope: !105)
!105 = !DILexicalBlockFile(scope: !103, file: !19, discriminator: 0)
!106 = !DILocation(line: 233, column: 8, scope: !105)
!107 = !DILocation(line: 240, column: 8, scope: !105)
!108 = !DILocation(line: 244, column: 8, scope: !105)
!109 = !DILocation(line: 245, column: 47, scope: !105)
!110 = !DILocation(line: 245, column: 8, scope: !105)
!111 = !DILocation(line: 246, column: 8, scope: !105)
!112 = !DILocation(line: 247, column: 47, scope: !105)
!113 = !DILocation(line: 247, column: 8, scope: !105)
!114 = !DILocation(line: 248, column: 8, scope: !105)
!115 = !DILocation(line: 249, column: 8, scope: !105)
!116 = distinct !DISubprogram(name: "lib::set_pending_authority.2", linkageName: "lib::set_pending_authority.2", scope: null, file: !19, line: 253, type: !5, scopeLine: 253, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!117 = !DILocation(line: 253, column: 8, scope: !118)
!118 = !DILexicalBlockFile(scope: !116, file: !19, discriminator: 0)
!119 = !DILocation(line: 257, column: 8, scope: !118)
!120 = !DILocation(line: 261, column: 8, scope: !118)
!121 = !DILocation(line: 263, column: 8, scope: !118)
!122 = !DILocation(line: 264, column: 8, scope: !118)
!123 = !DILocation(line: 265, column: 8, scope: !118)
!124 = !DILocation(line: 266, column: 8, scope: !118)
!125 = distinct !DISubprogram(name: "lib::cancel_authority_transfer.1", linkageName: "lib::cancel_authority_transfer.1", scope: null, file: !19, line: 270, type: !5, scopeLine: 270, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!126 = !DILocation(line: 270, column: 8, scope: !127)
!127 = !DILexicalBlockFile(scope: !125, file: !19, discriminator: 0)
!128 = !DILocation(line: 271, column: 8, scope: !127)
!129 = !DILocation(line: 275, column: 8, scope: !127)
!130 = distinct !DISubprogram(name: "lib::accept_authority_transfer.1", linkageName: "lib::accept_authority_transfer.1", scope: null, file: !19, line: 279, type: !5, scopeLine: 279, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!131 = !DILocation(line: 279, column: 8, scope: !132)
!132 = !DILexicalBlockFile(scope: !130, file: !19, discriminator: 0)
!133 = !DILocation(line: 280, column: 8, scope: !132)
!134 = !DILocation(line: 284, column: 67, scope: !132)
!135 = !DILocation(line: 284, column: 8, scope: !132)
!136 = !DILocation(line: 285, column: 8, scope: !132)
!137 = distinct !DISubprogram(name: "lib::create_market.anon.1", linkageName: "lib::create_market.anon.1", scope: null, file: !19, line: 292, type: !5, scopeLine: 292, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!138 = !DILocation(line: 292, column: 37, scope: !139)
!139 = !DILexicalBlockFile(scope: !137, file: !19, discriminator: 0)
!140 = !DILocation(line: 293, column: 12, scope: !139)
!141 = distinct !DISubprogram(name: "lib::create_market.2", linkageName: "lib::create_market.2", scope: null, file: !19, line: 289, type: !5, scopeLine: 289, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!142 = !DILocation(line: 289, column: 8, scope: !143)
!143 = !DILexicalBlockFile(scope: !141, file: !19, discriminator: 0)
!144 = !DILocation(line: 290, column: 8, scope: !143)
!145 = !DILocation(line: 291, column: 8, scope: !143)
!146 = !DILocation(line: 292, column: 11, scope: !143)
!147 = !DILocation(line: 292, column: 8, scope: !143)
!148 = !DILocation(line: 292, column: 37, scope: !143)
!149 = !DILocation(line: 298, column: 39, scope: !143)
!150 = !DILocation(line: 298, column: 8, scope: !143)
!151 = !DILocation(line: 299, column: 8, scope: !143)
!152 = !DILocation(line: 300, column: 8, scope: !143)
!153 = !DILocation(line: 304, column: 46, scope: !143)
!154 = !DILocation(line: 304, column: 12, scope: !143)
!155 = !DILocation(line: 305, column: 47, scope: !143)
!156 = !DILocation(line: 305, column: 12, scope: !143)
!157 = !DILocation(line: 306, column: 42, scope: !143)
!158 = !DILocation(line: 306, column: 12, scope: !143)
!159 = !DILocation(line: 307, column: 41, scope: !143)
!160 = !DILocation(line: 307, column: 12, scope: !143)
!161 = !DILocation(line: 303, column: 27, scope: !143)
!162 = !DILocation(line: 303, column: 8, scope: !143)
!163 = !DILocation(line: 309, column: 65, scope: !143)
!164 = !DILocation(line: 309, column: 22, scope: !143)
!165 = !DILocation(line: 309, column: 8, scope: !143)
!166 = !DILocation(line: 310, column: 8, scope: !143)
!167 = !DILocation(line: 312, column: 8, scope: !143)
!168 = !DILocation(line: 313, column: 8, scope: !143)
!169 = !DILocation(line: 314, column: 8, scope: !143)
!170 = !DILocation(line: 315, column: 8, scope: !143)
!171 = !DILocation(line: 316, column: 8, scope: !143)
!172 = !DILocation(line: 317, column: 8, scope: !143)
!173 = !DILocation(line: 318, column: 8, scope: !143)
!174 = !DILocation(line: 319, column: 8, scope: !143)
!175 = !DILocation(line: 320, column: 8, scope: !143)
!176 = distinct !DISubprogram(name: "lib::deposit.2", linkageName: "lib::deposit.2", scope: null, file: !19, line: 327, type: !5, scopeLine: 327, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!177 = !DILocation(line: 327, column: 8, scope: !178)
!178 = !DILexicalBlockFile(scope: !176, file: !19, discriminator: 0)
!179 = !DILocation(line: 328, column: 8, scope: !178)
!180 = !DILocation(line: 332, column: 45, scope: !178)
!181 = !DILocation(line: 332, column: 12, scope: !178)
!182 = !DILocation(line: 333, column: 44, scope: !178)
!183 = !DILocation(line: 333, column: 12, scope: !178)
!184 = !DILocation(line: 334, column: 41, scope: !178)
!185 = !DILocation(line: 334, column: 12, scope: !178)
!186 = !DILocation(line: 335, column: 41, scope: !178)
!187 = !DILocation(line: 335, column: 12, scope: !178)
!188 = !DILocation(line: 331, column: 27, scope: !178)
!189 = !DILocation(line: 331, column: 8, scope: !178)
!190 = !DILocation(line: 337, column: 65, scope: !178)
!191 = !DILocation(line: 337, column: 22, scope: !178)
!192 = !DILocation(line: 337, column: 8, scope: !178)
!193 = !DILocation(line: 338, column: 8, scope: !178)
!194 = !DILocation(line: 340, column: 8, scope: !178)
!195 = !DILocation(line: 341, column: 36, scope: !178)
!196 = !DILocation(line: 341, column: 8, scope: !178)
!197 = !DILocation(line: 342, column: 8, scope: !178)
!198 = !DILocation(line: 345, column: 13, scope: !178)
!199 = !DILocation(line: 346, column: 13, scope: !178)
!200 = !DILocation(line: 343, column: 8, scope: !178)
!201 = !DILocation(line: 348, column: 8, scope: !178)
!202 = !DILocation(line: 349, column: 8, scope: !178)
!203 = !DILocation(line: 355, column: 8, scope: !178)
!204 = distinct !DISubprogram(name: "lib::withdraw.2", linkageName: "lib::withdraw.2", scope: null, file: !19, line: 362, type: !5, scopeLine: 362, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!205 = !DILocation(line: 362, column: 8, scope: !206)
!206 = !DILexicalBlockFile(scope: !204, file: !19, discriminator: 0)
!207 = !DILocation(line: 363, column: 8, scope: !206)
!208 = !DILocation(line: 365, column: 8, scope: !206)
!209 = !DILocation(line: 366, column: 8, scope: !206)
!210 = !DILocation(line: 369, column: 13, scope: !206)
!211 = !DILocation(line: 370, column: 13, scope: !206)
!212 = !DILocation(line: 367, column: 8, scope: !206)
!213 = !DILocation(line: 373, column: 8, scope: !206)
!214 = !DILocation(line: 375, column: 46, scope: !206)
!215 = !DILocation(line: 375, column: 12, scope: !206)
!216 = !DILocation(line: 376, column: 43, scope: !206)
!217 = !DILocation(line: 376, column: 12, scope: !206)
!218 = !DILocation(line: 377, column: 43, scope: !206)
!219 = !DILocation(line: 377, column: 12, scope: !206)
!220 = !DILocation(line: 378, column: 41, scope: !206)
!221 = !DILocation(line: 378, column: 12, scope: !206)
!222 = !DILocation(line: 374, column: 27, scope: !206)
!223 = !DILocation(line: 374, column: 8, scope: !206)
!224 = !DILocation(line: 381, column: 39, scope: !206)
!225 = !DILocation(line: 380, column: 22, scope: !206)
!226 = !DILocation(line: 380, column: 8, scope: !206)
!227 = !DILocation(line: 385, column: 8, scope: !206)
!228 = !DILocation(line: 387, column: 8, scope: !206)
!229 = !DILocation(line: 388, column: 8, scope: !206)
!230 = !DILocation(line: 394, column: 8, scope: !206)
!231 = distinct !DISubprogram(name: "lib::place_bet.anon.1", linkageName: "lib::place_bet.anon.1", scope: null, file: !19, line: 433, type: !5, scopeLine: 433, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!232 = !DILocation(line: 433, column: 24, scope: !233)
!233 = !DILexicalBlockFile(scope: !231, file: !19, discriminator: 0)
!234 = !DILocation(line: 436, column: 17, scope: !233)
!235 = !DILocation(line: 437, column: 17, scope: !233)
!236 = !DILocation(line: 434, column: 12, scope: !233)
!237 = !DILocation(line: 442, column: 17, scope: !233)
!238 = !DILocation(line: 443, column: 17, scope: !233)
!239 = !DILocation(line: 438, column: 12, scope: !233)
!240 = distinct !DISubprogram(name: "lib::place_bet.anon.2", linkageName: "lib::place_bet.anon.2", scope: null, file: !19, line: 444, type: !5, scopeLine: 444, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!241 = !DILocation(line: 444, column: 15, scope: !242)
!242 = !DILexicalBlockFile(scope: !240, file: !19, discriminator: 0)
!243 = !DILocation(line: 447, column: 17, scope: !242)
!244 = !DILocation(line: 448, column: 17, scope: !242)
!245 = !DILocation(line: 445, column: 12, scope: !242)
!246 = !DILocation(line: 453, column: 17, scope: !242)
!247 = !DILocation(line: 454, column: 17, scope: !242)
!248 = !DILocation(line: 449, column: 12, scope: !242)
!249 = distinct !DISubprogram(name: "lib::place_bet.6", linkageName: "lib::place_bet.6", scope: null, file: !19, line: 405, type: !5, scopeLine: 405, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!250 = !DILocation(line: 405, column: 8, scope: !251)
!251 = !DILexicalBlockFile(scope: !249, file: !19, discriminator: 0)
!252 = !DILocation(line: 413, column: 8, scope: !251)
!253 = !DILocation(line: 414, column: 8, scope: !251)
!254 = !DILocation(line: 415, column: 8, scope: !251)
!255 = !DILocation(line: 416, column: 8, scope: !251)
!256 = !DILocation(line: 420, column: 8, scope: !251)
!257 = !DILocation(line: 421, column: 8, scope: !251)
!258 = !DILocation(line: 422, column: 8, scope: !251)
!259 = !DILocation(line: 428, column: 8, scope: !251)
!260 = !DILocation(line: 429, column: 41, scope: !251)
!261 = !DILocation(line: 429, column: 8, scope: !251)
!262 = !DILocation(line: 430, column: 37, scope: !251)
!263 = !DILocation(line: 430, column: 8, scope: !251)
!264 = !DILocation(line: 431, column: 8, scope: !251)
!265 = !DILocation(line: 433, column: 11, scope: !251)
!266 = !DILocation(line: 433, column: 8, scope: !251)
!267 = !DILocation(line: 433, column: 24, scope: !251)
!268 = !DILocation(line: 444, column: 15, scope: !251)
!269 = !DILocation(line: 459, column: 45, scope: !251)
!270 = !DILocation(line: 459, column: 12, scope: !251)
!271 = !DILocation(line: 460, column: 46, scope: !251)
!272 = !DILocation(line: 460, column: 12, scope: !251)
!273 = !DILocation(line: 461, column: 41, scope: !251)
!274 = !DILocation(line: 461, column: 12, scope: !251)
!275 = !DILocation(line: 462, column: 41, scope: !251)
!276 = !DILocation(line: 462, column: 12, scope: !251)
!277 = !DILocation(line: 458, column: 27, scope: !251)
!278 = !DILocation(line: 458, column: 8, scope: !251)
!279 = !DILocation(line: 464, column: 65, scope: !251)
!280 = !DILocation(line: 464, column: 22, scope: !251)
!281 = !DILocation(line: 464, column: 8, scope: !251)
!282 = !DILocation(line: 465, column: 8, scope: !251)
!283 = !DILocation(line: 467, column: 8, scope: !251)
!284 = !DILocation(line: 475, column: 8, scope: !251)
!285 = distinct !DISubprogram(name: "lib::sell_position.anon.1", linkageName: "lib::sell_position.anon.1", scope: null, file: !19, line: 507, type: !5, scopeLine: 507, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!286 = !DILocation(line: 507, column: 24, scope: !287)
!287 = !DILexicalBlockFile(scope: !285, file: !19, discriminator: 0)
!288 = !DILocation(line: 508, column: 12, scope: !287)
!289 = !DILocation(line: 511, column: 17, scope: !287)
!290 = !DILocation(line: 512, column: 17, scope: !287)
!291 = !DILocation(line: 509, column: 12, scope: !287)
!292 = !DILocation(line: 517, column: 17, scope: !287)
!293 = !DILocation(line: 518, column: 17, scope: !287)
!294 = !DILocation(line: 513, column: 12, scope: !287)
!295 = distinct !DISubprogram(name: "lib::sell_position.anon.2", linkageName: "lib::sell_position.anon.2", scope: null, file: !19, line: 519, type: !5, scopeLine: 519, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!296 = !DILocation(line: 519, column: 15, scope: !297)
!297 = !DILexicalBlockFile(scope: !295, file: !19, discriminator: 0)
!298 = !DILocation(line: 520, column: 12, scope: !297)
!299 = !DILocation(line: 523, column: 17, scope: !297)
!300 = !DILocation(line: 524, column: 17, scope: !297)
!301 = !DILocation(line: 521, column: 12, scope: !297)
!302 = !DILocation(line: 529, column: 17, scope: !297)
!303 = !DILocation(line: 530, column: 17, scope: !297)
!304 = !DILocation(line: 525, column: 12, scope: !297)
!305 = distinct !DISubprogram(name: "lib::sell_position.6", linkageName: "lib::sell_position.6", scope: null, file: !19, line: 486, type: !5, scopeLine: 486, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!306 = !DILocation(line: 486, column: 8, scope: !307)
!307 = !DILexicalBlockFile(scope: !305, file: !19, discriminator: 0)
!308 = !DILocation(line: 494, column: 8, scope: !307)
!309 = !DILocation(line: 495, column: 8, scope: !307)
!310 = !DILocation(line: 496, column: 8, scope: !307)
!311 = !DILocation(line: 497, column: 8, scope: !307)
!312 = !DILocation(line: 498, column: 8, scope: !307)
!313 = !DILocation(line: 499, column: 8, scope: !307)
!314 = !DILocation(line: 500, column: 8, scope: !307)
!315 = !DILocation(line: 506, column: 8, scope: !307)
!316 = !DILocation(line: 507, column: 11, scope: !307)
!317 = !DILocation(line: 507, column: 8, scope: !307)
!318 = !DILocation(line: 507, column: 24, scope: !307)
!319 = !DILocation(line: 519, column: 15, scope: !307)
!320 = !DILocation(line: 534, column: 8, scope: !307)
!321 = !DILocation(line: 540, column: 48, scope: !307)
!322 = !DILocation(line: 540, column: 12, scope: !307)
!323 = !DILocation(line: 541, column: 43, scope: !307)
!324 = !DILocation(line: 541, column: 12, scope: !307)
!325 = !DILocation(line: 542, column: 43, scope: !307)
!326 = !DILocation(line: 542, column: 12, scope: !307)
!327 = !DILocation(line: 543, column: 41, scope: !307)
!328 = !DILocation(line: 543, column: 12, scope: !307)
!329 = !DILocation(line: 539, column: 27, scope: !307)
!330 = !DILocation(line: 539, column: 8, scope: !307)
!331 = !DILocation(line: 546, column: 39, scope: !307)
!332 = !DILocation(line: 545, column: 22, scope: !307)
!333 = !DILocation(line: 545, column: 8, scope: !307)
!334 = !DILocation(line: 550, column: 8, scope: !307)
!335 = !DILocation(line: 552, column: 8, scope: !307)
!336 = !DILocation(line: 560, column: 8, scope: !307)
!337 = distinct !DISubprogram(name: "lib::resolve_market.2", linkageName: "lib::resolve_market.2", scope: null, file: !19, line: 567, type: !5, scopeLine: 567, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!338 = !DILocation(line: 567, column: 8, scope: !339)
!339 = !DILexicalBlockFile(scope: !337, file: !19, discriminator: 0)
!340 = !DILocation(line: 568, column: 8, scope: !339)
!341 = !DILocation(line: 572, column: 8, scope: !339)
!342 = !DILocation(line: 576, column: 8, scope: !339)
!343 = !DILocation(line: 578, column: 8, scope: !339)
!344 = !DILocation(line: 580, column: 8, scope: !339)
!345 = !DILocation(line: 581, column: 8, scope: !339)
!346 = !DILocation(line: 586, column: 8, scope: !339)
!347 = distinct !DISubprogram(name: "lib::claim_winnings.anon.1", linkageName: "lib::claim_winnings.anon.1", scope: null, file: !19, line: 599, type: !5, scopeLine: 599, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!348 = !DILocation(line: 599, column: 43, scope: !349)
!349 = !DILexicalBlockFile(scope: !347, file: !19, discriminator: 0)
!350 = !DILocation(line: 600, column: 12, scope: !349)
!351 = !DILocation(line: 601, column: 12, scope: !349)
!352 = !DILocation(line: 602, column: 12, scope: !349)
!353 = distinct !DISubprogram(name: "lib::claim_winnings.anon.2", linkageName: "lib::claim_winnings.anon.2", scope: null, file: !19, line: 604, type: !5, scopeLine: 604, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!354 = !DILocation(line: 604, column: 15, scope: !355)
!355 = !DILexicalBlockFile(scope: !353, file: !19, discriminator: 0)
!356 = !DILocation(line: 605, column: 12, scope: !355)
!357 = !DILocation(line: 606, column: 12, scope: !355)
!358 = !DILocation(line: 607, column: 12, scope: !355)
!359 = distinct !DISubprogram(name: "lib::claim_winnings.2", linkageName: "lib::claim_winnings.2", scope: null, file: !19, line: 594, type: !5, scopeLine: 594, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!360 = !DILocation(line: 594, column: 8, scope: !361)
!361 = !DILexicalBlockFile(scope: !359, file: !19, discriminator: 0)
!362 = !DILocation(line: 595, column: 8, scope: !361)
!363 = !DILocation(line: 596, column: 8, scope: !361)
!364 = !DILocation(line: 598, column: 8, scope: !361)
!365 = !DILocation(line: 599, column: 30, scope: !361)
!366 = !DILocation(line: 599, column: 27, scope: !361)
!367 = !DILocation(line: 599, column: 43, scope: !361)
!368 = !DILocation(line: 604, column: 15, scope: !361)
!369 = !DILocation(line: 599, column: 8, scope: !361)
!370 = !DILocation(line: 612, column: 8, scope: !361)
!371 = !DILocation(line: 613, column: 8, scope: !361)
!372 = !DILocation(line: 619, column: 13, scope: !361)
!373 = !DILocation(line: 620, column: 13, scope: !361)
!374 = !DILocation(line: 615, column: 8, scope: !361)
!375 = !DILocation(line: 623, column: 8, scope: !361)
!376 = !DILocation(line: 629, column: 48, scope: !361)
!377 = !DILocation(line: 629, column: 12, scope: !361)
!378 = !DILocation(line: 630, column: 43, scope: !361)
!379 = !DILocation(line: 630, column: 12, scope: !361)
!380 = !DILocation(line: 631, column: 43, scope: !361)
!381 = !DILocation(line: 631, column: 12, scope: !361)
!382 = !DILocation(line: 632, column: 41, scope: !361)
!383 = !DILocation(line: 632, column: 12, scope: !361)
!384 = !DILocation(line: 628, column: 27, scope: !361)
!385 = !DILocation(line: 628, column: 8, scope: !361)
!386 = !DILocation(line: 635, column: 39, scope: !361)
!387 = !DILocation(line: 634, column: 22, scope: !361)
!388 = !DILocation(line: 634, column: 8, scope: !361)
!389 = !DILocation(line: 639, column: 8, scope: !361)
!390 = !DILocation(line: 641, column: 8, scope: !361)
!391 = !DILocation(line: 642, column: 8, scope: !361)
!392 = !DILocation(line: 650, column: 8, scope: !361)
!393 = distinct !DISubprogram(name: "lib::collect_fees.anon.1", linkageName: "lib::collect_fees.anon.1", scope: null, file: !19, line: 667, type: !5, scopeLine: 667, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!394 = !DILocation(line: 667, column: 47, scope: !395)
!395 = !DILexicalBlockFile(scope: !393, file: !19, discriminator: 0)
!396 = distinct !DISubprogram(name: "lib::collect_fees.anon.2", linkageName: "lib::collect_fees.anon.2", scope: null, file: !19, line: 669, type: !5, scopeLine: 669, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!397 = !DILocation(line: 669, column: 31, scope: !398)
!398 = !DILexicalBlockFile(scope: !396, file: !19, discriminator: 0)
!399 = distinct !DISubprogram(name: "lib::collect_fees.anon.3", linkageName: "lib::collect_fees.anon.3", scope: null, file: !19, line: 671, type: !5, scopeLine: 671, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!400 = !DILocation(line: 671, column: 15, scope: !401)
!401 = !DILexicalBlockFile(scope: !399, file: !19, discriminator: 0)
!402 = !DILocation(line: 675, column: 17, scope: !401)
!403 = !DILocation(line: 676, column: 17, scope: !401)
!404 = distinct !DISubprogram(name: "lib::collect_fees.2", linkageName: "lib::collect_fees.2", scope: null, file: !19, line: 657, type: !5, scopeLine: 657, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!405 = !DILocation(line: 657, column: 8, scope: !406)
!406 = !DILexicalBlockFile(scope: !404, file: !19, discriminator: 0)
!407 = !DILocation(line: 658, column: 8, scope: !406)
!408 = !DILocation(line: 659, column: 8, scope: !406)
!409 = !DILocation(line: 664, column: 8, scope: !406)
!410 = !DILocation(line: 665, column: 8, scope: !406)
!411 = !DILocation(line: 667, column: 34, scope: !406)
!412 = !DILocation(line: 667, column: 31, scope: !406)
!413 = !DILocation(line: 667, column: 47, scope: !406)
!414 = !DILocation(line: 669, column: 18, scope: !406)
!415 = !DILocation(line: 669, column: 15, scope: !406)
!416 = !DILocation(line: 669, column: 31, scope: !406)
!417 = !DILocation(line: 671, column: 15, scope: !406)
!418 = !DILocation(line: 667, column: 8, scope: !406)
!419 = !DILocation(line: 679, column: 13, scope: !406)
!420 = !DILocation(line: 680, column: 13, scope: !406)
!421 = !DILocation(line: 678, column: 8, scope: !406)
!422 = !DILocation(line: 685, column: 13, scope: !406)
!423 = !DILocation(line: 686, column: 13, scope: !406)
!424 = !DILocation(line: 681, column: 8, scope: !406)
!425 = !DILocation(line: 687, column: 8, scope: !406)
!426 = !DILocation(line: 690, column: 8, scope: !406)
!427 = !DILocation(line: 696, column: 48, scope: !406)
!428 = !DILocation(line: 696, column: 12, scope: !406)
!429 = !DILocation(line: 697, column: 47, scope: !406)
!430 = !DILocation(line: 697, column: 12, scope: !406)
!431 = !DILocation(line: 698, column: 43, scope: !406)
!432 = !DILocation(line: 698, column: 12, scope: !406)
!433 = !DILocation(line: 699, column: 41, scope: !406)
!434 = !DILocation(line: 699, column: 12, scope: !406)
!435 = !DILocation(line: 695, column: 27, scope: !406)
!436 = !DILocation(line: 695, column: 8, scope: !406)
!437 = !DILocation(line: 702, column: 39, scope: !406)
!438 = !DILocation(line: 701, column: 22, scope: !406)
!439 = !DILocation(line: 701, column: 8, scope: !406)
!440 = !DILocation(line: 706, column: 8, scope: !406)
!441 = !DILocation(line: 708, column: 8, scope: !406)
!442 = !DILocation(line: 709, column: 8, scope: !406)
!443 = !DILocation(line: 715, column: 8, scope: !406)
!444 = distinct !DISubprogram(name: "lib::refund_cancelled.2", linkageName: "lib::refund_cancelled.2", scope: null, file: !19, line: 720, type: !5, scopeLine: 720, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!445 = !DILocation(line: 720, column: 8, scope: !446)
!446 = !DILexicalBlockFile(scope: !444, file: !19, discriminator: 0)
!447 = !DILocation(line: 721, column: 8, scope: !446)
!448 = !DILocation(line: 723, column: 8, scope: !446)
!449 = !DILocation(line: 726, column: 13, scope: !446)
!450 = !DILocation(line: 727, column: 13, scope: !446)
!451 = !DILocation(line: 724, column: 8, scope: !446)
!452 = !DILocation(line: 728, column: 8, scope: !446)
!453 = !DILocation(line: 731, column: 8, scope: !446)
!454 = !DILocation(line: 732, column: 8, scope: !446)
!455 = !DILocation(line: 734, column: 8, scope: !446)
!456 = !DILocation(line: 735, column: 8, scope: !446)
!457 = !DILocation(line: 741, column: 13, scope: !446)
!458 = !DILocation(line: 742, column: 13, scope: !446)
!459 = !DILocation(line: 737, column: 8, scope: !446)
!460 = !DILocation(line: 745, column: 8, scope: !446)
!461 = !DILocation(line: 751, column: 48, scope: !446)
!462 = !DILocation(line: 751, column: 12, scope: !446)
!463 = !DILocation(line: 752, column: 43, scope: !446)
!464 = !DILocation(line: 752, column: 12, scope: !446)
!465 = !DILocation(line: 753, column: 43, scope: !446)
!466 = !DILocation(line: 753, column: 12, scope: !446)
!467 = !DILocation(line: 754, column: 41, scope: !446)
!468 = !DILocation(line: 754, column: 12, scope: !446)
!469 = !DILocation(line: 750, column: 27, scope: !446)
!470 = !DILocation(line: 750, column: 8, scope: !446)
!471 = !DILocation(line: 757, column: 39, scope: !446)
!472 = !DILocation(line: 756, column: 22, scope: !446)
!473 = !DILocation(line: 756, column: 8, scope: !446)
!474 = !DILocation(line: 761, column: 8, scope: !446)
!475 = !DILocation(line: 763, column: 8, scope: !446)
!476 = distinct !DISubprogram(name: "lib::close_position.1", linkageName: "lib::close_position.1", scope: null, file: !19, line: 767, type: !5, scopeLine: 767, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!477 = !DILocation(line: 767, column: 8, scope: !478)
!478 = !DILexicalBlockFile(scope: !476, file: !19, discriminator: 0)
!479 = !DILocation(line: 768, column: 8, scope: !478)
!480 = !DILocation(line: 769, column: 8, scope: !478)
!481 = !DILocation(line: 773, column: 8, scope: !478)
!482 = distinct !DISubprogram(name: "sol.model.anchor.program.prediction_market_vault", linkageName: "sol.model.anchor.program.prediction_market_vault", scope: null, file: !19, line: 224, type: !5, scopeLine: 224, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!483 = !DILocation(line: 224, scope: !484)
!484 = !DILexicalBlockFile(scope: !482, file: !19, discriminator: 0)
!485 = !DILocation(line: 229, column: 4, scope: !484)
!486 = !DILocation(line: 253, column: 4, scope: !484)
!487 = !DILocation(line: 270, column: 4, scope: !484)
!488 = !DILocation(line: 279, column: 4, scope: !484)
!489 = !DILocation(line: 289, column: 4, scope: !484)
!490 = !DILocation(line: 327, column: 4, scope: !484)
!491 = !DILocation(line: 362, column: 4, scope: !484)
!492 = !DILocation(line: 405, column: 4, scope: !484)
!493 = !DILocation(line: 486, column: 4, scope: !484)
!494 = !DILocation(line: 567, column: 4, scope: !484)
!495 = !DILocation(line: 594, column: 4, scope: !484)
!496 = !DILocation(line: 657, column: 4, scope: !484)
!497 = !DILocation(line: 720, column: 4, scope: !484)
!498 = !DILocation(line: 767, column: 4, scope: !484)
!499 = distinct !DISubprogram(name: "main", linkageName: "main", scope: null, file: !19, line: 224, type: !5, scopeLine: 224, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!500 = !DILocation(line: 224, scope: !501)
!501 = !DILexicalBlockFile(scope: !499, file: !19, discriminator: 0)
!502 = distinct !DISubprogram(name: "sol.model.struct.anchor.InitializeConfig", linkageName: "sol.model.struct.anchor.InitializeConfig", scope: null, file: !19, line: 782, type: !5, scopeLine: 782, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!503 = !DILocation(line: 782, column: 4, scope: !504)
!504 = !DILexicalBlockFile(scope: !502, file: !19, discriminator: 0)
!505 = !DILocation(line: 783, column: 6, scope: !504)
!506 = !DILocation(line: 784, column: 8, scope: !504)
!507 = !DILocation(line: 786, column: 6, scope: !504)
!508 = !DILocation(line: 789, column: 8, scope: !504)
!509 = !DILocation(line: 790, column: 8, scope: !504)
!510 = !DILocation(line: 792, column: 6, scope: !504)
!511 = !DILocation(line: 799, column: 8, scope: !504)
!512 = !DILocation(line: 802, column: 8, scope: !504)
!513 = !DILocation(line: 804, column: 8, scope: !504)
!514 = distinct !DISubprogram(name: "sol.model.struct.anchor.SetPendingAuthority", linkageName: "sol.model.struct.anchor.SetPendingAuthority", scope: null, file: !19, line: 808, type: !5, scopeLine: 808, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!515 = !DILocation(line: 808, column: 4, scope: !516)
!516 = !DILexicalBlockFile(scope: !514, file: !19, discriminator: 0)
!517 = !DILocation(line: 809, column: 6, scope: !516)
!518 = !DILocation(line: 810, column: 8, scope: !516)
!519 = !DILocation(line: 812, column: 6, scope: !516)
!520 = !DILocation(line: 816, column: 8, scope: !516)
!521 = !DILocation(line: 818, column: 6, scope: !516)
!522 = !DILocation(line: 825, column: 8, scope: !516)
!523 = !DILocation(line: 827, column: 8, scope: !516)
!524 = distinct !DISubprogram(name: "sol.model.struct.anchor.CancelAuthorityTransfer", linkageName: "sol.model.struct.anchor.CancelAuthorityTransfer", scope: null, file: !19, line: 831, type: !5, scopeLine: 831, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!525 = !DILocation(line: 831, column: 4, scope: !526)
!526 = !DILexicalBlockFile(scope: !524, file: !19, discriminator: 0)
!527 = !DILocation(line: 832, column: 6, scope: !526)
!528 = !DILocation(line: 833, column: 8, scope: !526)
!529 = !DILocation(line: 835, column: 6, scope: !526)
!530 = !DILocation(line: 839, column: 8, scope: !526)
!531 = !DILocation(line: 841, column: 6, scope: !526)
!532 = !DILocation(line: 847, column: 8, scope: !526)
!533 = distinct !DISubprogram(name: "sol.model.struct.anchor.AcceptAuthorityTransfer", linkageName: "sol.model.struct.anchor.AcceptAuthorityTransfer", scope: null, file: !19, line: 851, type: !5, scopeLine: 851, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!534 = !DILocation(line: 851, column: 4, scope: !535)
!535 = !DILexicalBlockFile(scope: !533, file: !19, discriminator: 0)
!536 = !DILocation(line: 852, column: 6, scope: !535)
!537 = !DILocation(line: 853, column: 8, scope: !535)
!538 = !DILocation(line: 855, column: 6, scope: !535)
!539 = !DILocation(line: 860, column: 8, scope: !535)
!540 = !DILocation(line: 862, column: 6, scope: !535)
!541 = !DILocation(line: 868, column: 8, scope: !535)
!542 = distinct !DISubprogram(name: "sol.model.struct.anchor.CreateMarket", linkageName: "sol.model.struct.anchor.CreateMarket", scope: null, file: !19, line: 873, type: !5, scopeLine: 873, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!543 = !DILocation(line: 873, column: 4, scope: !544)
!544 = !DILexicalBlockFile(scope: !542, file: !19, discriminator: 0)
!545 = !DILocation(line: 874, column: 6, scope: !544)
!546 = !DILocation(line: 875, column: 8, scope: !544)
!547 = !DILocation(line: 877, column: 6, scope: !544)
!548 = !DILocation(line: 884, column: 8, scope: !544)
!549 = !DILocation(line: 886, column: 6, scope: !544)
!550 = !DILocation(line: 893, column: 8, scope: !544)
!551 = !DILocation(line: 895, column: 6, scope: !544)
!552 = !DILocation(line: 899, column: 8, scope: !544)
!553 = !DILocation(line: 902, column: 6, scope: !544)
!554 = !DILocation(line: 907, column: 8, scope: !544)
!555 = !DILocation(line: 910, column: 6, scope: !544)
!556 = !DILocation(line: 916, column: 8, scope: !544)
!557 = !DILocation(line: 919, column: 6, scope: !544)
!558 = !DILocation(line: 922, column: 8, scope: !544)
!559 = !DILocation(line: 924, column: 8, scope: !544)
!560 = !DILocation(line: 925, column: 8, scope: !544)
!561 = !DILocation(line: 926, column: 8, scope: !544)
!562 = distinct !DISubprogram(name: "sol.model.struct.anchor.Deposit", linkageName: "sol.model.struct.anchor.Deposit", scope: null, file: !19, line: 931, type: !5, scopeLine: 931, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!563 = !DILocation(line: 931, column: 4, scope: !564)
!564 = !DILexicalBlockFile(scope: !562, file: !19, discriminator: 0)
!565 = !DILocation(line: 932, column: 6, scope: !564)
!566 = !DILocation(line: 933, column: 8, scope: !564)
!567 = !DILocation(line: 935, column: 6, scope: !564)
!568 = !DILocation(line: 939, column: 8, scope: !564)
!569 = !DILocation(line: 942, column: 6, scope: !564)
!570 = !DILocation(line: 945, column: 8, scope: !564)
!571 = !DILocation(line: 947, column: 6, scope: !564)
!572 = !DILocation(line: 954, column: 8, scope: !564)
!573 = !DILocation(line: 957, column: 6, scope: !564)
!574 = !DILocation(line: 962, column: 8, scope: !564)
!575 = !DILocation(line: 965, column: 6, scope: !564)
!576 = !DILocation(line: 971, column: 8, scope: !564)
!577 = !DILocation(line: 973, column: 8, scope: !564)
!578 = !DILocation(line: 974, column: 8, scope: !564)
!579 = !DILocation(line: 975, column: 8, scope: !564)
!580 = distinct !DISubprogram(name: "sol.model.struct.anchor.Withdraw", linkageName: "sol.model.struct.anchor.Withdraw", scope: null, file: !19, line: 980, type: !5, scopeLine: 980, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!581 = !DILocation(line: 980, column: 4, scope: !582)
!582 = !DILexicalBlockFile(scope: !580, file: !19, discriminator: 0)
!583 = !DILocation(line: 981, column: 6, scope: !582)
!584 = !DILocation(line: 982, column: 8, scope: !582)
!585 = !DILocation(line: 984, column: 6, scope: !582)
!586 = !DILocation(line: 988, column: 8, scope: !582)
!587 = !DILocation(line: 991, column: 6, scope: !582)
!588 = !DILocation(line: 994, column: 8, scope: !582)
!589 = !DILocation(line: 996, column: 6, scope: !582)
!590 = !DILocation(line: 1002, column: 8, scope: !582)
!591 = !DILocation(line: 1005, column: 6, scope: !582)
!592 = !DILocation(line: 1010, column: 8, scope: !582)
!593 = !DILocation(line: 1013, column: 6, scope: !582)
!594 = !DILocation(line: 1019, column: 8, scope: !582)
!595 = !DILocation(line: 1021, column: 8, scope: !582)
!596 = distinct !DISubprogram(name: "sol.model.struct.anchor.PlaceBet", linkageName: "sol.model.struct.anchor.PlaceBet", scope: null, file: !19, line: 1025, type: !5, scopeLine: 1025, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!597 = !DILocation(line: 1025, column: 4, scope: !598)
!598 = !DILexicalBlockFile(scope: !596, file: !19, discriminator: 0)
!599 = !DILocation(line: 1026, column: 6, scope: !598)
!600 = !DILocation(line: 1027, column: 8, scope: !598)
!601 = !DILocation(line: 1030, column: 8, scope: !598)
!602 = !DILocation(line: 1032, column: 6, scope: !598)
!603 = !DILocation(line: 1036, column: 8, scope: !598)
!604 = !DILocation(line: 1038, column: 6, scope: !598)
!605 = !DILocation(line: 1043, column: 8, scope: !598)
!606 = !DILocation(line: 1045, column: 6, scope: !598)
!607 = !DILocation(line: 1052, column: 8, scope: !598)
!608 = !DILocation(line: 1055, column: 6, scope: !598)
!609 = !DILocation(line: 1058, column: 8, scope: !598)
!610 = !DILocation(line: 1061, column: 6, scope: !598)
!611 = !DILocation(line: 1066, column: 8, scope: !598)
!612 = !DILocation(line: 1069, column: 6, scope: !598)
!613 = !DILocation(line: 1075, column: 8, scope: !598)
!614 = !DILocation(line: 1077, column: 8, scope: !598)
!615 = !DILocation(line: 1078, column: 8, scope: !598)
!616 = !DILocation(line: 1079, column: 8, scope: !598)
!617 = distinct !DISubprogram(name: "sol.model.struct.anchor.SellPosition", linkageName: "sol.model.struct.anchor.SellPosition", scope: null, file: !19, line: 1083, type: !5, scopeLine: 1083, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!618 = !DILocation(line: 1083, column: 4, scope: !619)
!619 = !DILexicalBlockFile(scope: !617, file: !19, discriminator: 0)
!620 = !DILocation(line: 1084, column: 6, scope: !619)
!621 = !DILocation(line: 1085, column: 8, scope: !619)
!622 = !DILocation(line: 1088, column: 8, scope: !619)
!623 = !DILocation(line: 1090, column: 6, scope: !619)
!624 = !DILocation(line: 1094, column: 8, scope: !619)
!625 = !DILocation(line: 1096, column: 6, scope: !619)
!626 = !DILocation(line: 1101, column: 8, scope: !619)
!627 = !DILocation(line: 1103, column: 6, scope: !619)
!628 = !DILocation(line: 1109, column: 8, scope: !619)
!629 = !DILocation(line: 1112, column: 6, scope: !619)
!630 = !DILocation(line: 1115, column: 8, scope: !619)
!631 = !DILocation(line: 1118, column: 6, scope: !619)
!632 = !DILocation(line: 1123, column: 8, scope: !619)
!633 = !DILocation(line: 1126, column: 6, scope: !619)
!634 = !DILocation(line: 1132, column: 8, scope: !619)
!635 = !DILocation(line: 1134, column: 8, scope: !619)
!636 = distinct !DISubprogram(name: "sol.model.struct.anchor.ResolveMarket", linkageName: "sol.model.struct.anchor.ResolveMarket", scope: null, file: !19, line: 1138, type: !5, scopeLine: 1138, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!637 = !DILocation(line: 1138, column: 4, scope: !638)
!638 = !DILexicalBlockFile(scope: !636, file: !19, discriminator: 0)
!639 = !DILocation(line: 1139, column: 8, scope: !638)
!640 = !DILocation(line: 1141, column: 6, scope: !638)
!641 = !DILocation(line: 1145, column: 8, scope: !638)
!642 = !DILocation(line: 1147, column: 6, scope: !638)
!643 = !DILocation(line: 1152, column: 8, scope: !638)
!644 = distinct !DISubprogram(name: "sol.model.struct.anchor.ClaimWinnings", linkageName: "sol.model.struct.anchor.ClaimWinnings", scope: null, file: !19, line: 1156, type: !5, scopeLine: 1156, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!645 = !DILocation(line: 1156, column: 4, scope: !646)
!646 = !DILexicalBlockFile(scope: !644, file: !19, discriminator: 0)
!647 = !DILocation(line: 1157, column: 6, scope: !646)
!648 = !DILocation(line: 1158, column: 8, scope: !646)
!649 = !DILocation(line: 1160, column: 6, scope: !646)
!650 = !DILocation(line: 1164, column: 8, scope: !646)
!651 = !DILocation(line: 1166, column: 6, scope: !646)
!652 = !DILocation(line: 1171, column: 8, scope: !646)
!653 = !DILocation(line: 1173, column: 6, scope: !646)
!654 = !DILocation(line: 1179, column: 8, scope: !646)
!655 = !DILocation(line: 1182, column: 6, scope: !646)
!656 = !DILocation(line: 1185, column: 8, scope: !646)
!657 = !DILocation(line: 1188, column: 6, scope: !646)
!658 = !DILocation(line: 1193, column: 8, scope: !646)
!659 = !DILocation(line: 1196, column: 6, scope: !646)
!660 = !DILocation(line: 1202, column: 8, scope: !646)
!661 = !DILocation(line: 1204, column: 8, scope: !646)
!662 = distinct !DISubprogram(name: "sol.model.struct.anchor.CollectFees", linkageName: "sol.model.struct.anchor.CollectFees", scope: null, file: !19, line: 1208, type: !5, scopeLine: 1208, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!663 = !DILocation(line: 1208, column: 4, scope: !664)
!664 = !DILexicalBlockFile(scope: !662, file: !19, discriminator: 0)
!665 = !DILocation(line: 1209, column: 6, scope: !664)
!666 = !DILocation(line: 1210, column: 8, scope: !664)
!667 = !DILocation(line: 1212, column: 6, scope: !664)
!668 = !DILocation(line: 1216, column: 8, scope: !664)
!669 = !DILocation(line: 1218, column: 6, scope: !664)
!670 = !DILocation(line: 1223, column: 8, scope: !664)
!671 = !DILocation(line: 1227, column: 6, scope: !664)
!672 = !DILocation(line: 1230, column: 8, scope: !664)
!673 = !DILocation(line: 1233, column: 6, scope: !664)
!674 = !DILocation(line: 1236, column: 8, scope: !664)
!675 = !DILocation(line: 1239, column: 6, scope: !664)
!676 = !DILocation(line: 1244, column: 8, scope: !664)
!677 = !DILocation(line: 1247, column: 6, scope: !664)
!678 = !DILocation(line: 1253, column: 8, scope: !664)
!679 = !DILocation(line: 1255, column: 8, scope: !664)
!680 = !DILocation(line: 1256, column: 8, scope: !664)
!681 = !DILocation(line: 1257, column: 8, scope: !664)
!682 = distinct !DISubprogram(name: "sol.model.struct.anchor.RefundCancelled", linkageName: "sol.model.struct.anchor.RefundCancelled", scope: null, file: !19, line: 1261, type: !5, scopeLine: 1261, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!683 = !DILocation(line: 1261, column: 4, scope: !684)
!684 = !DILexicalBlockFile(scope: !682, file: !19, discriminator: 0)
!685 = !DILocation(line: 1262, column: 6, scope: !684)
!686 = !DILocation(line: 1263, column: 8, scope: !684)
!687 = !DILocation(line: 1265, column: 6, scope: !684)
!688 = !DILocation(line: 1269, column: 8, scope: !684)
!689 = !DILocation(line: 1271, column: 6, scope: !684)
!690 = !DILocation(line: 1276, column: 8, scope: !684)
!691 = !DILocation(line: 1278, column: 6, scope: !684)
!692 = !DILocation(line: 1284, column: 8, scope: !684)
!693 = !DILocation(line: 1287, column: 6, scope: !684)
!694 = !DILocation(line: 1290, column: 8, scope: !684)
!695 = !DILocation(line: 1293, column: 6, scope: !684)
!696 = !DILocation(line: 1298, column: 8, scope: !684)
!697 = !DILocation(line: 1301, column: 6, scope: !684)
!698 = !DILocation(line: 1307, column: 8, scope: !684)
!699 = !DILocation(line: 1309, column: 8, scope: !684)
!700 = distinct !DISubprogram(name: "sol.model.struct.anchor.ClosePosition", linkageName: "sol.model.struct.anchor.ClosePosition", scope: null, file: !19, line: 1313, type: !5, scopeLine: 1313, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !6)
!701 = !DILocation(line: 1313, column: 4, scope: !702)
!702 = !DILexicalBlockFile(scope: !700, file: !19, discriminator: 0)
!703 = !DILocation(line: 1314, column: 6, scope: !702)
!704 = !DILocation(line: 1315, column: 8, scope: !702)
!705 = !DILocation(line: 1317, column: 6, scope: !702)
!706 = !DILocation(line: 1324, column: 8, scope: !702)
