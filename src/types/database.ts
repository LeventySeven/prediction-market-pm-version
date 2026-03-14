export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type JsonValue = Json;

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          profile_description: string | null;
          avatar_palette: Json | null;
          profile_setup_completed_at: string | null;
          telegram_id: number | null;
          telegram_username: string | null;
          telegram_first_name: string | null;
          telegram_last_name: string | null;
          telegram_photo_url: string | null;
          telegram_auth_date: string | null;
          referral_code: string | null;
          referral_commission_rate: number | null;
          referral_enabled: boolean | null;
          is_admin: boolean;
          privy_user_id: string | null;
          privy_wallet_address: string | null;
          auth_provider: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          profile_description?: string | null;
          avatar_palette?: Json | null;
          profile_setup_completed_at?: string | null;
          telegram_id?: number | null;
          telegram_username?: string | null;
          telegram_first_name?: string | null;
          telegram_last_name?: string | null;
          telegram_photo_url?: string | null;
          telegram_auth_date?: string | null;
          referral_code?: string | null;
          referral_commission_rate?: number | null;
          referral_enabled?: boolean | null;
          is_admin?: boolean;
          privy_user_id?: string | null;
          privy_wallet_address?: string | null;
          auth_provider?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          profile_description?: string | null;
          avatar_palette?: Json | null;
          profile_setup_completed_at?: string | null;
          telegram_id?: number | null;
          telegram_username?: string | null;
          telegram_first_name?: string | null;
          telegram_last_name?: string | null;
          telegram_photo_url?: string | null;
          telegram_auth_date?: string | null;
          referral_code?: string | null;
          referral_commission_rate?: number | null;
          referral_enabled?: boolean | null;
          is_admin?: boolean;
          privy_user_id?: string | null;
          privy_wallet_address?: string | null;
          auth_provider?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      wallet_balances: {
        Row: {
          user_id: string;
          asset_code: string;
          balance_minor: number;
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
          {
            foreignKeyName: "wallet_balances_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_referrals: {
        Row: {
          id: string;
          user_id: string;
          referrer_user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          referrer_user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          referrer_user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_referrals_referrer_user_id_fkey";
            columns: ["referrer_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_referrals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
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
          {
            foreignKeyName: "market_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "market_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
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
          {
            foreignKeyName: "market_comment_likes_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "market_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_comment_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
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
          {
            foreignKeyName: "market_bookmarks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      market_context: {
        Row: {
          market_id: string;
          context: string;
          sources: Json;
          updated_at: string;
        };
        Insert: {
          market_id: string;
          context: string;
          sources?: Json;
          updated_at?: string;
        };
        Update: {
          market_id?: string;
          context?: string;
          sources?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      polymarket_market_cache: {
        Row: {
          market_id: string;
          condition_id: string;
          slug: string;
          title: string;
          description: string | null;
          image_url: string | null;
          source_url: string | null;
          state: "open" | "closed" | "resolved" | "cancelled";
          market_created_at: string;
          closes_at: string;
          expires_at: string;
          category: string | null;
          volume: number;
          clob_token_ids: Json;
          outcomes: Json;
          resolved_outcome_title: string | null;
          search_text: string;
          source_updated_at: string;
          last_synced_at: string;
        };
        Insert: {
          market_id: string;
          condition_id: string;
          slug: string;
          title: string;
          description?: string | null;
          image_url?: string | null;
          source_url?: string | null;
          state: "open" | "closed" | "resolved" | "cancelled";
          market_created_at: string;
          closes_at: string;
          expires_at: string;
          category?: string | null;
          volume?: number;
          clob_token_ids?: Json;
          outcomes?: Json;
          resolved_outcome_title?: string | null;
          search_text?: string;
          source_updated_at?: string;
          last_synced_at?: string;
        };
        Update: {
          market_id?: string;
          condition_id?: string;
          slug?: string;
          title?: string;
          description?: string | null;
          image_url?: string | null;
          source_url?: string | null;
          state?: "open" | "closed" | "resolved" | "cancelled";
          market_created_at?: string;
          closes_at?: string;
          expires_at?: string;
          category?: string | null;
          volume?: number;
          clob_token_ids?: Json;
          outcomes?: Json;
          resolved_outcome_title?: string | null;
          search_text?: string;
          source_updated_at?: string;
          last_synced_at?: string;
        };
        Relationships: [];
      };
      polymarket_sync_state: {
        Row: {
          scope: string;
          last_started_at: string | null;
          last_success_at: string | null;
          last_error: string | null;
          updated_at: string;
        };
        Insert: {
          scope: string;
          last_started_at?: string | null;
          last_success_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Update: {
          scope?: string;
          last_started_at?: string | null;
          last_success_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      polymarket_market_live: {
        Row: {
          market_id: string;
          best_bid: number;
          best_ask: number;
          mid: number;
          last_trade_price: number;
          last_trade_size: number;
          rolling_24h_volume: number;
          open_interest: number | null;
          source_seq: number | null;
          source_ts: string;
          updated_at: string;
          ingested_at: string;
        };
        Insert: {
          market_id: string;
          best_bid?: number;
          best_ask?: number;
          mid?: number;
          last_trade_price?: number;
          last_trade_size?: number;
          rolling_24h_volume?: number;
          open_interest?: number | null;
          source_seq?: number | null;
          source_ts: string;
          updated_at?: string;
          ingested_at?: string;
        };
        Update: {
          market_id?: string;
          best_bid?: number;
          best_ask?: number;
          mid?: number;
          last_trade_price?: number;
          last_trade_size?: number;
          rolling_24h_volume?: number;
          open_interest?: number | null;
          source_seq?: number | null;
          source_ts?: string;
          updated_at?: string;
          ingested_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "polymarket_market_live_market_id_fkey";
            columns: ["market_id"];
            isOneToOne: true;
            referencedRelation: "polymarket_market_cache";
            referencedColumns: ["market_id"];
          },
        ];
      };
      polymarket_candles_1m: {
        Row: {
          market_id: string;
          bucket_start: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
          trades_count: number;
          source_ts_max: string | null;
          updated_at: string;
        };
        Insert: {
          market_id: string;
          bucket_start: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume?: number;
          trades_count?: number;
          source_ts_max?: string | null;
          updated_at?: string;
        };
        Update: {
          market_id?: string;
          bucket_start?: string;
          open?: number;
          high?: number;
          low?: number;
          close?: number;
          volume?: number;
          trades_count?: number;
          source_ts_max?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "polymarket_candles_1m_market_id_fkey";
            columns: ["market_id"];
            isOneToOne: false;
            referencedRelation: "polymarket_market_cache";
            referencedColumns: ["market_id"];
          },
        ];
      };
      polymarket_market_ticks: {
        Row: {
          id: number;
          market_id: string;
          trade_id: string | null;
          source_seq: number | null;
          source_ts: string;
          side: "BUY" | "SELL" | "UNKNOWN";
          outcome: string | null;
          price: number;
          size: number;
          notional: number;
          dedupe_key: string;
          payload: Json | null;
          created_at: string;
          ingested_at: string;
        };
        Insert: {
          id?: number;
          market_id: string;
          trade_id?: string | null;
          source_seq?: number | null;
          source_ts: string;
          side?: "BUY" | "SELL" | "UNKNOWN";
          outcome?: string | null;
          price: number;
          size: number;
          notional?: number;
          dedupe_key: string;
          payload?: Json | null;
          created_at?: string;
          ingested_at?: string;
        };
        Update: {
          id?: number;
          market_id?: string;
          trade_id?: string | null;
          source_seq?: number | null;
          source_ts?: string;
          side?: "BUY" | "SELL" | "UNKNOWN";
          outcome?: string | null;
          price?: number;
          size?: number;
          notional?: number;
          dedupe_key?: string;
          payload?: Json | null;
          created_at?: string;
          ingested_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "polymarket_market_ticks_market_id_fkey";
            columns: ["market_id"];
            isOneToOne: false;
            referencedRelation: "polymarket_market_cache";
            referencedColumns: ["market_id"];
          },
        ];
      };
      user_events: {
        Row: {
          id: number;
          user_id: string | null;
          session_id: string;
          market_id: string;
          event_type:
            | "view"
            | "dwell"
            | "click"
            | "bookmark"
            | "comment"
            | "trade_intent";
          event_value: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          session_id: string;
          market_id: string;
          event_type:
            | "view"
            | "dwell"
            | "click"
            | "bookmark"
            | "comment"
            | "trade_intent";
          event_value?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          session_id?: string;
          market_id?: string;
          event_type?:
            | "view"
            | "dwell"
            | "click"
            | "bookmark"
            | "comment"
            | "trade_intent";
          event_value?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      market_embeddings: {
        Row: {
          market_id: string;
          model: string;
          embedding: number[] | string;
          updated_at: string;
        };
        Insert: {
          market_id: string;
          model: string;
          embedding: number[] | string;
          updated_at?: string;
        };
        Update: {
          market_id?: string;
          model?: string;
          embedding?: number[] | string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "market_embeddings_market_id_fkey";
            columns: ["market_id"];
            isOneToOne: true;
            referencedRelation: "polymarket_market_cache";
            referencedColumns: ["market_id"];
          },
        ];
      };
      market_ai_tags: {
        Row: {
          id: number;
          market_id: string;
          tag: string;
          confidence: number;
          model: string;
          prompt_version: string;
          snapshot_fingerprint: string;
          classified_at: string;
        };
        Insert: {
          id?: number;
          market_id: string;
          tag: string;
          confidence: number;
          model?: string;
          prompt_version?: string;
          snapshot_fingerprint?: string;
          classified_at?: string;
        };
        Update: {
          id?: number;
          market_id?: string;
          tag?: string;
          confidence?: number;
          model?: string;
          prompt_version?: string;
          snapshot_fingerprint?: string;
          classified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "market_ai_tags_market_id_fkey";
            columns: ["market_id"];
            isOneToOne: false;
            referencedRelation: "market_catalog";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
