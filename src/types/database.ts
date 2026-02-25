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
          solana_wallet_address: string | null;
          solana_cluster: string | null;
          solana_wallet_connected_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
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
          solana_wallet_address?: string | null;
          solana_cluster?: string | null;
          solana_wallet_connected_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
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
          solana_wallet_address?: string | null;
          solana_cluster?: string | null;
          solana_wallet_connected_at?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

