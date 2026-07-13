export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          created_at: string
          id: number
          kind: string
          pool_id: string | null
          tokens: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          pool_id?: string | null
          tokens?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          pool_id?: string | null
          tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_tombstone: string | null
          actor_user_id: string | null
          created_at: string
          id: number
          meta: Json | null
          target: string | null
        }
        Insert: {
          action: string
          actor_tombstone?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: never
          meta?: Json | null
          target?: string | null
        }
        Update: {
          action?: string
          actor_tombstone?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: never
          meta?: Json | null
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_email_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          purpose: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_email_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_events: {
        Row: {
          contract_id: string
          event_index: number
          event_type: string
          id: number
          ledger: number
          occurred_at: string
          op_index: number
          payload: Json | null
          tx_hash: string
          tx_index: number
        }
        Insert: {
          contract_id: string
          event_index?: number
          event_type: string
          id?: never
          ledger: number
          occurred_at?: string
          op_index?: number
          payload?: Json | null
          tx_hash: string
          tx_index?: number
        }
        Update: {
          contract_id?: string
          event_index?: number
          event_type?: string
          id?: never
          ledger?: number
          occurred_at?: string
          op_index?: number
          payload?: Json | null
          tx_hash?: string
          tx_index?: number
        }
        Relationships: []
      }
      contribution_meta: {
        Row: {
          created_at: string
          note: string | null
          pool_id: string
          proof_url: string | null
          tx_hash: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          pool_id: string
          proof_url?: string | null
          tx_hash: string
        }
        Update: {
          created_at?: string
          note?: string | null
          pool_id?: string
          proof_url?: string | null
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "contribution_meta_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_contributions: {
        Row: {
          cycle_id: string
          id: string
          paid_at: string | null
          status: string
          stellar_address: string | null
          tx_hash: string | null
          user_id: string | null
        }
        Insert: {
          cycle_id: string
          id?: string
          paid_at?: string | null
          status?: string
          stellar_address?: string | null
          tx_hash?: string | null
          user_id?: string | null
        }
        Update: {
          cycle_id?: string
          id?: string
          paid_at?: string | null
          status?: string
          stellar_address?: string | null
          tx_hash?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cycle_contributions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "paluwagan_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_contributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          payload: Json | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          payload?: Json | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          payload?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      indexer_cursor: {
        Row: {
          contract_id: string
          last_event_position: string | null
          last_ledger: number
          updated_at: string
        }
        Insert: {
          contract_id: string
          last_event_position?: string | null
          last_ledger?: number
          updated_at?: string
        }
        Update: {
          contract_id?: string
          last_event_position?: string | null
          last_ledger?: number
          updated_at?: string
        }
        Relationships: []
      }
      invite_redemptions: {
        Row: {
          id: string
          invite_id: string
          redeemed_at: string
          redeemed_by: string
        }
        Insert: {
          id?: string
          invite_id: string
          redeemed_at?: string
          redeemed_by: string
        }
        Update: {
          id?: string
          invite_id?: string
          redeemed_at?: string
          redeemed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_redemptions_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "pool_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_redemptions_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: number
          payload: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: never
          payload?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: never
          payload?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paluwagan_cycles: {
        Row: {
          created_at: string
          cycle_no: number
          due_amount: number | null
          due_date: string | null
          id: string
          order_proof: string | null
          payout_address: string | null
          payout_order: Json | null
          payout_tx_hash: string | null
          payout_user_id: string | null
          pool_id: string
          status: string
        }
        Insert: {
          created_at?: string
          cycle_no: number
          due_amount?: number | null
          due_date?: string | null
          id?: string
          order_proof?: string | null
          payout_address?: string | null
          payout_order?: Json | null
          payout_tx_hash?: string | null
          payout_user_id?: string | null
          pool_id: string
          status?: string
        }
        Update: {
          created_at?: string
          cycle_no?: number
          due_amount?: number | null
          due_date?: string | null
          id?: string
          order_proof?: string | null
          payout_address?: string | null
          payout_order?: Json | null
          payout_tx_hash?: string | null
          payout_user_id?: string | null
          pool_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "paluwagan_cycles_payout_user_id_fkey"
            columns: ["payout_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paluwagan_cycles_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      payees: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          pool_id: string
          stellar_address: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          pool_id: string
          stellar_address: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          pool_id?: string
          stellar_address?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payees_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_uses: number
          pool_id: string
          role: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number
          pool_id: string
          role?: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number
          pool_id?: string
          role?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pool_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_invites_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_members: {
        Row: {
          display_name_override: string | null
          invited_by: string | null
          joined_at: string
          pool_id: string
          role: string
          stellar_address: string | null
          user_id: string
        }
        Insert: {
          display_name_override?: string | null
          invited_by?: string | null
          joined_at?: string
          pool_id: string
          role?: string
          stellar_address?: string | null
          user_id: string
        }
        Update: {
          display_name_override?: string | null
          invited_by?: string | null
          joined_at?: string
          pool_id?: string
          role?: string
          stellar_address?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_members_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pools: {
        Row: {
          contract_id: string | null
          contract_version: number
          created_at: string
          created_by: string | null
          currency_label: string
          description: string | null
          id: string
          kind: string
          name: string
          network: string
          policy: Json | null
          rules_text: string | null
          status: string
          updated_at: string
          wasm_hash: string | null
        }
        Insert: {
          contract_id?: string | null
          contract_version?: number
          created_at?: string
          created_by?: string | null
          currency_label?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
          network?: string
          policy?: Json | null
          rules_text?: string | null
          status?: string
          updated_at?: string
          wasm_hash?: string | null
        }
        Update: {
          contract_id?: string | null
          contract_version?: number
          created_at?: string
          created_by?: string | null
          currency_label?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          network?: string
          policy?: Json | null
          rules_text?: string | null
          status?: string
          updated_at?: string
          wasm_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          is_email_verified: boolean
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          is_email_verified?: boolean
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_email_verified?: boolean
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spend_meta: {
        Row: {
          created_at: string
          created_by: string | null
          note: string | null
          pool_id: string
          receipt_urls: string[]
          spend_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          pool_id: string
          receipt_urls?: string[]
          spend_id: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          pool_id?: string
          receipt_urls?: string[]
          spend_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "spend_meta_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spend_meta_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          currency_display: string
          notif_prefs: Json
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          currency_display?: string
          notif_prefs?: Json
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          currency_display?: string
          notif_prefs?: Json
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_wallets: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          kind: string
          label: string | null
          stellar_address: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          label?: string | null
          stellar_address: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          label?: string | null
          stellar_address?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_link_challenges: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          nonce: string
          stellar_address: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          nonce: string
          stellar_address: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string
          stellar_address?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_link_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_pool: {
        Args: { p_contract_id: string; p_pool: string; p_wasm_hash?: string }
        Returns: undefined
      }
      create_pool_draft: {
        Args: {
          p_description?: string
          p_kind?: string
          p_name: string
          p_policy?: Json
          p_rules_text?: string
        }
        Returns: string
      }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      is_pool_member: { Args: { p_pool: string }; Returns: boolean }
      is_pool_officer: { Args: { p_pool: string }; Returns: boolean }
      preview_pool: {
        Args: { p_code: string }
        Returns: {
          description: string
          kind: string
          member_count: number
          name: string
          pool_id: string
          role: string
        }[]
      }
      redeem_invite: {
        Args: { p_address?: string; p_code: string }
        Returns: string
      }
      set_my_pool_address: {
        Args: { p_address: string; p_pool: string }
        Returns: undefined
      }
      shares_pool: { Args: { p_other: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
