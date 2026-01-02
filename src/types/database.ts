// Auto-generated types for Supabase schema
// Reflects new security-first schema with wallet_balances, positions, trades, LMSR AMM

export type OutcomeSide = "YES" | "NO";
export type MarketState = "open" | "closed" | "resolved" | "cancelled";
export type TradeAction = "buy" | "sell";
export type WalletTxKind = "deposit" | "withdraw" | "trade" | "payout" | "referral" | "fee";
export type RewardStatus = "pending" | "paid" | "reversed";

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
          is_admin: boolean;
          referral_code: string | null;
          referral_commission_rate: number | null;
          referral_enabled: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          display_name?: string | null;
          email: string;
          is_admin?: boolean;
          referral_code?: string | null;
          referral_commission_rate?: number | null;
          referral_enabled?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          email?: string;
          is_admin?: boolean;
          referral_code?: string | null;
          referral_commission_rate?: number | null;
          referral_enabled?: boolean | null;
          created_at?: string;
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
      markets: {
        Row: {
          id: string;
          title_rus: string;
          title_eng: string;
          description: string | null;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          title_rus: string;
          title_eng: string;
          description?: string | null;
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
          created_at?: string;
        };
        Update: {
          id?: string;
          title_rus?: string;
          title_eng?: string;
          description?: string | null;
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
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "markets_settlement_asset_code_fkey"; columns: ["settlement_asset_code"]; referencedRelation: "assets"; referencedColumns: ["code"] }
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
        Relationships: [];
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
    };
    Views: {
      trades_public: {
        Row: {
          id: string;
          market_id: string;
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
        Relationships: [];
      };
      leaderboard_public: {
        Row: {
          user_id: string;
          name: string;
          username: string;
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
    };
    CompositeTypes: Record<string, never>;
  };
}
