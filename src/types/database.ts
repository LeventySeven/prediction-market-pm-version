export interface Database {
  public: {
    Tables: {
      markets: {
        Row: {
          id: string;
          title_rus: string;
          title_eng: string;
          description: string | null;
          pool_yes: number;
          pool_no: number;
          expires_at: string;
          outcome: "YES" | "NO" | null;
        };
        Insert: {
          id?: string;
          title_rus: string;
          title_eng: string;
          description?: string | null;
          pool_yes?: number;
          pool_no?: number;
          expires_at: string;
          outcome?: "YES" | "NO" | null;
        };
        Update: {
          id?: string;
          title_rus?: string;
          title_eng?: string;
          description?: string | null;
          pool_yes?: number;
          pool_no?: number;
          expires_at?: string;
          outcome?: "YES" | "NO" | null;
        };
        Relationships: [];
      };
      bets: {
        Row: {
          id: string;
          side: "YES" | "NO";
          amount: number;
          status: string;
          payout: number | null;
          created_at: string;
          user_id: string;
          market_id: string;
        };
        Insert: {
          id?: string;
          side: "YES" | "NO";
          amount: number;
          status?: string;
          payout?: number | null;
          created_at?: string;
          user_id: string;
          market_id: string;
        };
        Update: {
          id?: string;
          side?: "YES" | "NO";
          amount?: number;
          status?: string;
          payout?: number | null;
          created_at?: string;
          user_id?: string;
          market_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bets_market_id_fkey";
            columns: ["market_id"];
            referencedRelation: "markets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bets_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      users: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          balance: number;
          created_at: string;
          email: string;
          password_hash: string | null;
          is_admin: boolean;
        };
        Insert: {
          id?: string;
          username: string;
          display_name?: string | null;
          balance?: number;
          created_at?: string;
          email: string;
          password_hash?: string | null;
          is_admin?: boolean;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          balance?: number;
          created_at?: string;
          email?: string;
          password_hash?: string | null;
          is_admin?: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      place_bet_tx: {
        Args: {
          p_user_id: string;
          p_market_id: string;
          p_side: "YES" | "NO";
          p_amount: number;
        };
        Returns: {
          bet_id: string;
          new_balance: number;
        };
      };
      resolve_market_tx: {
        Args: {
          p_market_id: string;
          p_outcome: "YES" | "NO";
        };
        Returns: {
          market_id: string;
          outcome: "YES" | "NO";
          total_pool: number;
          winner_pool: number;
          updated_bets_count: number;
        };
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

