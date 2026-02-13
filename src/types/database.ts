// Auto-generated types for Supabase schema
// Reflects new security-first schema with wallet_balances, positions, trades, LMSR AMM

export type OutcomeSide = "YES" | "NO";
export type MarketState = "open" | "closed" | "resolved" | "cancelled";
export type TradeAction = "buy" | "sell";
export type WalletTxKind = "deposit" | "withdraw" | "trade" | "payout" | "referral" | "fee";
export type RewardStatus = "pending" | "paid" | "reversed";

// JSON-compatible value (useful for metadata blobs).
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

// WalletConnect/On-chain types
export type OnChainTxStatus = "pending" | "confirmed" | "failed";
export type OnChainTxType = "deposit" | "bet" | "sell" | "claim" | "withdraw" | "approve";
export type DepositStatus = "pending" | "confirmed" | "failed" | "credited";

export interface Database {
  public: {
    Tables: {
      assets: {
        Row: {
          code: string;
          decimals: number;
          is_enabled: boolean;
          created_at: string;
        };
        Insert: {
          code: string;
          decimals: number;
          is_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          code?: string;
          decimals?: number;
          is_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          email: string;
          avatar_url: string | null;
          telegram_id: number | null;
          telegram_username: string | null;
          telegram_first_name: string | null;
          telegram_last_name: string | null;
          telegram_photo_url: string | null;
          telegram_auth_date: string | null;
          is_admin: boolean;
          referral_code: string | null;
          referral_commission_rate: number | null;
          referral_enabled: boolean | null;
          created_at: string;
          // Solana wallet fields
          solana_wallet_address: string | null;
          solana_cluster: string | null;
          solana_wallet_connected_at: string | null;
        };
        Insert: {
          id?: string;
          username: string;
          display_name?: string | null;
          email: string;
          avatar_url?: string | null;
          telegram_id?: number | null;
          telegram_username?: string | null;
          telegram_first_name?: string | null;
          telegram_last_name?: string | null;
          telegram_photo_url?: string | null;
          telegram_auth_date?: string | null;
          is_admin?: boolean;
          referral_code?: string | null;
          referral_commission_rate?: number | null;
          referral_enabled?: boolean | null;
          created_at?: string;
          // Solana wallet fields
          solana_wallet_address?: string | null;
          solana_cluster?: string | null;
          solana_wallet_connected_at?: string | null;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          email?: string;
          avatar_url?: string | null;
          telegram_id?: number | null;
          telegram_username?: string | null;
          telegram_first_name?: string | null;
          telegram_last_name?: string | null;
          telegram_photo_url?: string | null;
          telegram_auth_date?: string | null;
          is_admin?: boolean;
          referral_code?: string | null;
          referral_commission_rate?: number | null;
          referral_enabled?: boolean | null;
          created_at?: string;
          // Solana wallet fields
          solana_wallet_address?: string | null;
          solana_cluster?: string | null;
          solana_wallet_connected_at?: string | null;
        };
        Relationships: [];
      };
      wallet_balances: {
        Row: {
          user_id: string;
          asset_code: string;
          balance_minor: number; // bigint in DB, but JS number for now
          updated_at: string;
        };
        Insert: {
          user_id: string;
          asset_code: string;
          balance_minor?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          asset_code?: string;
          balance_minor?: number;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "wallet_balances_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "wallet_balances_asset_code_fkey"; columns: ["asset_code"]; referencedRelation: "assets"; referencedColumns: ["code"] }
        ];
      };
      wallet_transactions: {
        Row: {
          id: string;
          user_id: string;
          asset_code: string;
          amount_minor: number;
          kind: WalletTxKind;
          market_id: string | null;
          trade_id: string | null;
          external_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          asset_code: string;
          amount_minor: number;
          kind: WalletTxKind;
          market_id?: string | null;
          trade_id?: string | null;
          external_ref?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          asset_code?: string;
          amount_minor?: number;
          kind?: WalletTxKind;
          market_id?: string | null;
          trade_id?: string | null;
          external_ref?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      market_comments: {
        Row: {
          id: string;
          market_id: string;
          user_id: string;
          parent_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          market_id: string;
          user_id: string;
          parent_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          market_id?: string;
          user_id?: string;
          parent_id?: string | null;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "market_comments_market_id_fkey"; columns: ["market_id"]; referencedRelation: "markets"; referencedColumns: ["id"] },
          { foreignKeyName: "market_comments_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
      market_comment_likes: {
        Row: {
          comment_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          comment_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          comment_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "market_comment_likes_comment_id_fkey"; columns: ["comment_id"]; referencedRelation: "market_comments"; referencedColumns: ["id"] },
          { foreignKeyName: "market_comment_likes_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
      market_bookmarks: {
        Row: {
          user_id: string;
          market_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          market_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          market_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "market_bookmarks_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "market_bookmarks_market_id_fkey"; columns: ["market_id"]; referencedRelation: "markets"; referencedColumns: ["id"] }
        ];
      };
      market_categories: {
        Row: {
          id: string;
          label_ru: string;
          label_en: string;
          is_enabled: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id: string;
          label_ru: string;
          label_en: string;
          is_enabled?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          label_ru?: string;
          label_en?: string;
          is_enabled?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      market_context: {
        Row: {
          market_id: string;
          context: string;
          sources: JsonValue;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          market_id: string;
          context: string;
          sources?: JsonValue;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          market_id?: string;
          context?: string;
          sources?: JsonValue;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "market_context_market_id_fkey"; columns: ["market_id"]; referencedRelation: "markets"; referencedColumns: ["id"] }
        ];
      };
      markets: {
        Row: {
          id: string;
          title_rus: string | null;
          title_eng: string;
          description: string | null;
          source: string | null;
          image_url: string | null;
          state: MarketState;
          closes_at: string;
          expires_at: string;
          resolve_outcome: OutcomeSide | null;
          settlement_asset_code: string;
          fee_bps: number;
          liquidity_b: number;
          amm_type: string;
          category_id: string | null;
          category_label_ru: string | null;
          category_label_en: string | null;
          created_by: string | null;
          onchain_market_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title_rus?: string | null;
          title_eng: string;
          description?: string | null;
          source?: string | null;
          image_url?: string | null;
          state?: MarketState;
          closes_at: string;
          expires_at: string;
          resolve_outcome?: OutcomeSide | null;
          settlement_asset_code?: string;
          fee_bps?: number;
          liquidity_b?: number;
          amm_type?: string;
          category_id?: string | null;
          category_label_ru?: string | null;
          category_label_en?: string | null;
          created_by?: string | null;
          onchain_market_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title_rus?: string;
          title_eng?: string;
          description?: string | null;
          source?: string | null;
          image_url?: string | null;
          state?: MarketState;
          closes_at?: string;
          expires_at?: string;
          resolve_outcome?: OutcomeSide | null;
          settlement_asset_code?: string;
          fee_bps?: number;
          liquidity_b?: number;
          amm_type?: string;
          category_id?: string | null;
          category_label_ru?: string | null;
          category_label_en?: string | null;
          created_by?: string | null;
          onchain_market_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "markets_settlement_asset_code_fkey"; columns: ["settlement_asset_code"]; referencedRelation: "assets"; referencedColumns: ["code"] }
        ];
      };
      market_onchain_map: {
        Row: {
          market_id: string;
          solana_cluster: string;
          program_id: string;
          market_pda: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          market_id: string;
          solana_cluster: string;
          program_id: string;
          market_pda: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          market_id?: string;
          solana_cluster?: string;
          program_id?: string;
          market_pda?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "market_onchain_map_market_id_fkey"; columns: ["market_id"]; referencedRelation: "markets"; referencedColumns: ["id"] }
        ];
      };
      market_amm_state: {
        Row: {
          market_id: string;
          b: number;
          q_yes: number;
          q_no: number;
          last_price_yes: number;
          fee_accumulated_minor: number;
          updated_at: string;
        };
        Insert: {
          market_id: string;
          b: number;
          q_yes?: number;
          q_no?: number;
          last_price_yes?: number;
          fee_accumulated_minor?: number;
          updated_at?: string;
        };
        Update: {
          market_id?: string;
          b?: number;
          q_yes?: number;
          q_no?: number;
          last_price_yes?: number;
          fee_accumulated_minor?: number;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "market_amm_state_market_id_fkey"; columns: ["market_id"]; referencedRelation: "markets"; referencedColumns: ["id"]; isOneToOne: true }
        ];
      };
      positions: {
        Row: {
          user_id: string;
          market_id: string;
          outcome: OutcomeSide;
          shares: number;
          avg_entry_price: number | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          market_id: string;
          outcome: OutcomeSide;
          shares?: number;
          avg_entry_price?: number | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          market_id?: string;
          outcome?: OutcomeSide;
          shares?: number;
          avg_entry_price?: number | null;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "positions_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "positions_market_id_fkey"; columns: ["market_id"]; referencedRelation: "markets"; referencedColumns: ["id"] }
        ];
      };
      trades: {
        Row: {
          id: string;
          market_id: string;
          user_id: string;
          action: TradeAction;
          outcome: OutcomeSide;
          asset_code: string;
          collateral_gross_minor: number;
          fee_minor: number;
          collateral_net_minor: number;
          shares_delta: number;
          price_before: number;
          price_after: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          market_id: string;
          user_id: string;
          action: TradeAction;
          outcome: OutcomeSide;
          asset_code: string;
          collateral_gross_minor: number;
          fee_minor?: number;
          collateral_net_minor: number;
          shares_delta: number;
          price_before: number;
          price_after: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          market_id?: string;
          user_id?: string;
          action?: TradeAction;
          outcome?: OutcomeSide;
          asset_code?: string;
          collateral_gross_minor?: number;
          fee_minor?: number;
          collateral_net_minor?: number;
          shares_delta?: number;
          price_before?: number;
          price_after?: number;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "trades_market_id_fkey"; columns: ["market_id"]; referencedRelation: "markets"; referencedColumns: ["id"] },
          { foreignKeyName: "trades_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "trades_asset_code_fkey"; columns: ["asset_code"]; referencedRelation: "assets"; referencedColumns: ["code"] }
        ];
      };
      market_price_candles: {
        Row: {
          market_id: string;
          bucket: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume_minor: number;
          trades_count: number;
        };
        Insert: {
          market_id: string;
          bucket: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume_minor?: number;
          trades_count?: number;
        };
        Update: {
          market_id?: string;
          bucket?: string;
          open?: number;
          high?: number;
          low?: number;
          close?: number;
          volume_minor?: number;
          trades_count?: number;
        };
        Relationships: [];
      };
      user_referrals: {
        Row: {
          user_id: string;
          referrer_user_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          referrer_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          referrer_user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      referral_rewards: {
        Row: {
          id: string;
          source_user_id: string;
          beneficiary_user_id: string;
          level: number;
          trade_id: string | null;
          market_id: string | null;
          asset_code: string;
          amount_minor: number;
          status: RewardStatus;
          commission_rate_snapshot: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_user_id: string;
          beneficiary_user_id: string;
          level: number;
          trade_id?: string | null;
          market_id?: string | null;
          asset_code: string;
          amount_minor: number;
          status?: RewardStatus;
          commission_rate_snapshot?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_user_id?: string;
          beneficiary_user_id?: string;
          level?: number;
          trade_id?: string | null;
          market_id?: string | null;
          asset_code?: string;
          amount_minor?: number;
          status?: RewardStatus;
          commission_rate_snapshot?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // Solana on-chain tables
      on_chain_transactions: {
        Row: {
          id: string;
          user_id: string;
          tx_sig: string;
          solana_cluster: string;
          status: OnChainTxStatus;
          tx_type: OnChainTxType;
          amount_minor: number | null;
          asset_code: string | null;
          market_id: string | null;
          trade_id: string | null;
          nonce: number | null;
          gas_used: number | null;
          gas_price_gwei: number | null;
          block_number: number | null;
          block_timestamp: string | null;
          error_message: string | null;
          metadata: JsonValue;
          created_at: string;
          confirmed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tx_sig: string;
          solana_cluster: string;
          status?: OnChainTxStatus;
          tx_type: OnChainTxType;
          amount_minor?: number | null;
          asset_code?: string | null;
          market_id?: string | null;
          trade_id?: string | null;
          nonce?: number | null;
          gas_used?: number | null;
          gas_price_gwei?: number | null;
          block_number?: number | null;
          block_timestamp?: string | null;
          error_message?: string | null;
          metadata?: JsonValue;
          created_at?: string;
          confirmed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tx_sig?: string;
          solana_cluster?: string;
          status?: OnChainTxStatus;
          tx_type?: OnChainTxType;
          amount_minor?: number | null;
          asset_code?: string | null;
          market_id?: string | null;
          trade_id?: string | null;
          nonce?: number | null;
          gas_used?: number | null;
          gas_price_gwei?: number | null;
          block_number?: number | null;
          block_timestamp?: string | null;
          error_message?: string | null;
          metadata?: JsonValue;
          created_at?: string;
          confirmed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "on_chain_transactions_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "on_chain_transactions_asset_code_fkey"; columns: ["asset_code"]; referencedRelation: "assets"; referencedColumns: ["code"] },
          { foreignKeyName: "on_chain_transactions_market_id_fkey"; columns: ["market_id"]; referencedRelation: "markets"; referencedColumns: ["id"] },
          { foreignKeyName: "on_chain_transactions_trade_id_fkey"; columns: ["trade_id"]; referencedRelation: "trades"; referencedColumns: ["id"] }
        ];
      };
      deposits: {
        Row: {
          id: string;
          user_id: string;
          tx_sig: string;
          solana_cluster: string;
          amount_minor: number;
          asset_code: string;
          status: DepositStatus;
          from_pubkey: string;
          block_number: number | null;
          block_timestamp: string | null;
          credited_at: string | null;
          wallet_tx_id: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tx_sig: string;
          solana_cluster: string;
          amount_minor: number;
          asset_code: string;
          status?: DepositStatus;
          from_pubkey: string;
          block_number?: number | null;
          block_timestamp?: string | null;
          credited_at?: string | null;
          wallet_tx_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tx_sig?: string;
          solana_cluster?: string;
          amount_minor?: number;
          asset_code?: string;
          status?: DepositStatus;
          from_pubkey?: string;
          block_number?: number | null;
          block_timestamp?: string | null;
          credited_at?: string | null;
          wallet_tx_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "deposits_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "deposits_asset_code_fkey"; columns: ["asset_code"]; referencedRelation: "assets"; referencedColumns: ["code"] },
          { foreignKeyName: "deposits_wallet_tx_id_fkey"; columns: ["wallet_tx_id"]; referencedRelation: "wallet_transactions"; referencedColumns: ["id"] }
        ];
      };
    };
    Views: {
      users_public: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          telegram_photo_url: string | null;
        };
        Relationships: [];
      };
      wallet_transactions_public: {
        Row: {
          id: string;
          user_id: string;
          kind: WalletTxKind;
          amount_minor: number;
          market_id: string | null;
          market_title_rus: string | null;
          market_title_eng: string | null;
          created_at: string;
        };
        Relationships: [];
      };
      user_pnl_daily_public: {
        Row: {
          user_id: string;
          day: string;
          pnl_minor: number;
        };
        Relationships: [];
      };
      user_market_votes_public: {
        Row: {
          user_id: string;
          market_id: string;
          outcome: OutcomeSide;
          last_bet_at: string;
        };
        Relationships: [];
      };
      user_market_bets_public: {
        Row: {
          user_id: string;
          market_id: string;
          outcome: OutcomeSide;
          last_bet_at: string;
          is_active: boolean;
          position_updated_at: string | null;
        };
        Relationships: [];
      };
      trades_public: {
        Row: {
          id: string;
          market_id: string;
          action: TradeAction;
          is_sold: boolean;
          outcome: OutcomeSide;
          asset_code: string;
          collateral_gross_minor: number;
          fee_minor: number;
          collateral_net_minor: number;
          shares_delta: number;
          price_before: number;
          price_after: number;
          created_at: string;
        };
        Relationships: [];
      };
      market_comments_public: {
        Row: {
          id: string;
          market_id: string;
          user_id: string;
          parent_id: string | null;
          body: string;
          created_at: string;
          author_name: string;
          author_username: string | null;
          author_avatar_url: string | null;
          likes_count: number;
        };
        Relationships: [];
      };
      trades_public_with_user: {
        Row: {
          id: string;
          market_id: string;
          user_id: string;
          action: TradeAction;
          is_sold: boolean;
          outcome: OutcomeSide;
          asset_code: string;
          collateral_gross_minor: number;
          fee_minor: number;
          collateral_net_minor: number;
          shares_delta: number;
          price_before: number;
          price_after: number;
          created_at: string;
        };
        Relationships: [];
      };
      leaderboard_public: {
        Row: {
          user_id: string;
          name: string;
          username: string;
          avatar_url: string | null;
          balance_minor: number;
          pnl_minor: number;
          bet_count: number;
          referrals: number;
          rank: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      // Authenticated user functions (use auth.uid() internally)
      place_bet_tx: {
        Args: {
          p_market_id: string;
          p_side: string; // 'YES' | 'NO'
          p_amount: number;
        };
        Returns: {
          trade_id: string;
          new_balance_minor: number;
          shares_bought: number;
          price_before: number;
          price_after: number;
        };
      };
      sell_position_tx: {
        Args: {
          p_market_id: string;
          p_side: string; // 'YES' | 'NO'
          p_shares: number;
        };
        Returns: {
          trade_id: string;
          payout_net_minor: number;
          new_balance_minor: number;
          shares_sold: number;
          price_before: number;
          price_after: number;
        };
      };
      sell_position_service_tx: {
        Args: {
          p_user_id: string;
          p_market_id: string;
          p_side: string; // 'YES' | 'NO'
          p_shares: number;
        };
        Returns: {
          trade_id: string;
          payout_net_minor: number;
          new_balance_minor: number;
          shares_sold: number;
          price_before: number;
          price_after: number;
        };
      };
      place_bet_onchain_tx: {
        Args: {
          p_market_id: string;
          p_side: string; // 'YES' | 'NO'
          p_collateral_minor: number;
          p_shares: number;
          p_price_before: number;
          p_price_after: number;
          p_user_id?: string | null;
        };
        Returns: {
          trade_id: string;
          new_balance_minor: number;
          shares_bought: number;
          price_before: number;
          price_after: number;
        };
      };
      place_bet_onchain_service_tx: {
        Args: {
          p_user_id: string;
          p_market_id: string;
          p_side: string; // 'YES' | 'NO'
          p_collateral_minor: number;
          p_shares: number;
          p_price_before: number;
          p_price_after: number;
        };
        Returns: {
          trade_id: string;
          new_balance_minor: number;
          shares_bought: number;
          price_before: number;
          price_after: number;
        };
      };
      sell_position_onchain_tx: {
        Args: {
          p_market_id: string;
          p_side: string; // 'YES' | 'NO'
          p_shares: number;
          p_payout_minor: number;
          p_price_before: number;
          p_price_after: number;
          p_user_id?: string | null;
        };
        Returns: {
          trade_id: string;
          payout_net_minor: number;
          new_balance_minor: number;
          shares_sold: number;
          price_before: number;
          price_after: number;
        };
      };
      sell_position_onchain_service_tx: {
        Args: {
          p_user_id: string;
          p_market_id: string;
          p_side: string; // 'YES' | 'NO'
          p_shares: number;
          p_payout_minor: number;
          p_price_before: number;
          p_price_after: number;
        };
        Returns: {
          trade_id: string;
          payout_net_minor: number;
          new_balance_minor: number;
          shares_sold: number;
          price_before: number;
          price_after: number;
        };
      };
      claim_winnings_onchain_tx: {
        Args: {
          p_market_id: string;
          p_user_id: string;
          p_payout_minor: number;
        };
        Returns: {
          new_balance_minor: number;
        };
      };
      // Service-role only functions
      resolve_market_service_tx: {
        Args: {
          p_market_id: string;
          p_outcome: string; // 'YES' | 'NO'
        };
        Returns: {
          market_id: string;
          outcome: string;
          total_payout_minor: number;
          winners_count: number;
        };
      };
      wallet_deposit_service_tx: {
        Args: {
          p_user_id: string;
          p_asset_code: string;
          p_amount: number;
          p_external_ref: string;
        };
        Returns: {
          transaction_id: string;
          new_balance_minor: number;
        };
      };
    };
    Enums: {
      market_state: MarketState;
      outcome_side: OutcomeSide;
      trade_action: TradeAction;
      wallet_tx_kind: WalletTxKind;
      reward_status: RewardStatus;
      // WalletConnect/On-chain enums
      on_chain_tx_status: OnChainTxStatus;
      on_chain_tx_type: OnChainTxType;
      deposit_status: DepositStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
