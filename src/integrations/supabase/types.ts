export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string;
          description: string;
          key: string;
          name: string;
          reward_xp: number;
          sort_order: number;
          tier: string;
        };
        Insert: {
          category?: string;
          description: string;
          key: string;
          name: string;
          reward_xp: number;
          sort_order: number;
          tier?: string;
        };
        Update: {
          category?: string;
          description?: string;
          key?: string;
          name?: string;
          reward_xp?: number;
          sort_order?: number;
          tier?: string;
        };
        Relationships: [];
      };
      day_notes: {
        Row: {
          day: string;
          note: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          day: string;
          note?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          day?: string;
          note?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      friend_code_attempts: {
        Row: {
          attempted_at: string;
          id: number;
          user_id: string;
        };
        Insert: {
          attempted_at?: string;
          id?: never;
          user_id: string;
        };
        Update: {
          attempted_at?: string;
          id?: never;
          user_id?: string;
        };
        Relationships: [];
      };
      friend_requests: {
        Row: {
          addressee_id: string;
          created_at: string;
          id: string;
          requester_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          addressee_id: string;
          created_at?: string;
          id?: string;
          requester_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          addressee_id?: string;
          created_at?: string;
          id?: string;
          requester_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      habit_logs: {
        Row: {
          completed_at: string;
          count: number;
          day: string;
          habit_id: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string;
          count?: number;
          day: string;
          habit_id: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string;
          count?: number;
          day?: string;
          habit_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      habit_notes: {
        Row: {
          day: string;
          habit_id: string;
          id: string;
          note: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          day: string;
          habit_id: string;
          id?: string;
          note?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          day?: string;
          habit_id?: string;
          id?: string;
          note?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habit_notes_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      habit_reminder_deliveries: {
        Row: {
          day: string;
          delivered_at: string;
          habit_id: string;
          user_id: string;
        };
        Insert: {
          day: string;
          delivered_at?: string;
          habit_id: string;
          user_id: string;
        };
        Update: {
          day?: string;
          delivered_at?: string;
          habit_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habit_reminder_deliveries_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      habits: {
        Row: {
          archived_at: string | null;
          category: string;
          color: string;
          created_at: string;
          daily_goal_count: number;
          daily_goal_minutes: number;
          description: string;
          difficulty: string;
          frequency: string;
          habit_type: string;
          icon: string;
          id: string;
          is_paused: boolean;
          name: string;
          reminder_enabled: boolean;
          reminder_time: string;
          schedule_days: number[];
          skipped_dates: string[];
          streak_freezes: number;
          tracking_type: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          category?: string;
          color?: string;
          created_at?: string;
          daily_goal_count?: number;
          daily_goal_minutes?: number;
          description?: string;
          difficulty?: string;
          frequency?: string;
          habit_type?: string;
          icon?: string;
          id?: string;
          is_paused?: boolean;
          name: string;
          reminder_enabled?: boolean;
          reminder_time?: string;
          schedule_days?: number[];
          skipped_dates?: string[];
          streak_freezes?: number;
          tracking_type?: string;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          category?: string;
          color?: string;
          created_at?: string;
          daily_goal_count?: number;
          daily_goal_minutes?: number;
          description?: string;
          difficulty?: string;
          frequency?: string;
          habit_type?: string;
          icon?: string;
          id?: string;
          is_paused?: boolean;
          name?: string;
          reminder_enabled?: boolean;
          reminder_time?: string;
          schedule_days?: number[];
          skipped_dates?: string[];
          streak_freezes?: number;
          tracking_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      reminder_deliveries: {
        Row: {
          day: string;
          delivered_at: string;
          user_id: string;
        };
        Insert: {
          day: string;
          delivered_at?: string;
          user_id: string;
        };
        Update: {
          day?: string;
          delivered_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      reminder_subscriptions: {
        Row: {
          created_at: string;
          endpoint: string;
          id: string;
          subscription: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          id?: string;
          subscription: Json;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          id?: string;
          subscription?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      social_presence: {
        Row: {
          last_seen_at: string;
          user_id: string;
        };
        Insert: {
          last_seen_at?: string;
          user_id: string;
        };
        Update: {
          last_seen_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      social_profiles: {
        Row: {
          created_at: string;
          display_name: string;
          friend_code: string;
          share_presence: boolean;
          share_progress: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string;
          friend_code: string;
          share_presence?: boolean;
          share_progress?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          friend_code?: string;
          share_presence?: boolean;
          share_progress?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_achievements: {
        Row: {
          achievement_key: string;
          is_featured: boolean;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          achievement_key: string;
          is_featured?: boolean;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          achievement_key?: string;
          is_featured?: boolean;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_key_fkey";
            columns: ["achievement_key"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["key"];
          },
        ];
      };
      user_blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          daily_goal_minutes: number;
          daily_target_minutes: number;
          pomodoro_focus_minutes: number;
          pomodoro_long_break_minutes: number;
          pomodoro_short_break_minutes: number;
          reminder_enabled: boolean;
          reminder_time: string;
          timezone: string;
          user_id: string;
        };
        Insert: {
          daily_goal_minutes?: number;
          daily_target_minutes?: number;
          pomodoro_focus_minutes?: number;
          pomodoro_long_break_minutes?: number;
          pomodoro_short_break_minutes?: number;
          reminder_enabled?: boolean;
          reminder_time?: string;
          timezone?: string;
          user_id?: string;
        };
        Update: {
          daily_goal_minutes?: number;
          daily_target_minutes?: number;
          pomodoro_focus_minutes?: number;
          pomodoro_long_break_minutes?: number;
          pomodoro_short_break_minutes?: number;
          reminder_enabled?: boolean;
          reminder_time?: string;
          timezone?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_xp: {
        Row: {
          total_xp: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          total_xp?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          total_xp?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      work_sessions: {
        Row: {
          ended_at: string | null;
          habit_id: string | null;
          id: string;
          mode: string;
          started_at: string;
          user_id: string;
        };
        Insert: {
          ended_at?: string | null;
          habit_id?: string | null;
          id?: string;
          mode?: string;
          started_at?: string;
          user_id?: string;
        };
        Update: {
          ended_at?: string | null;
          habit_id?: string | null;
          id?: string;
          mode?: string;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_sessions_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      xp_transactions: {
        Row: {
          amount: number;
          created_at: string;
          day: string | null;
          habit_id: string | null;
          id: string;
          idempotency_key: string;
          reason: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          day?: string | null;
          habit_id?: string | null;
          id?: string;
          idempotency_key: string;
          reason: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          day?: string | null;
          habit_id?: string | null;
          id?: string;
          idempotency_key?: string;
          reason?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xp_transactions_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      revoke_habit_completion_xp: {
        Args: {
          p_habit_id: string;
          p_day: string;
        };
        Returns: boolean;
      };

      block_friend: { Args: { p_friend_code: string }; Returns: boolean };
      ensure_social_profile: {
        Args: { p_name?: string; p_user_id: string };
        Returns: undefined;
      };
      get_social_overview: { Args: never; Returns: Json };
      grant_habit_xp: {
        Args: {
          p_amount: number;
          p_day?: string;
          p_habit_id?: string;
          p_idempotency_key: string;
          p_reason: string;
          p_user_id: string;
        };
        Returns: boolean;
      };
      heartbeat_social_presence: {
        Args: { p_online?: boolean };
        Returns: boolean;
      };
      remove_friend: { Args: { p_friend_code: string }; Returns: boolean };
      respond_friend_request: {
        Args: { p_accept: boolean; p_request_id: string };
        Returns: boolean;
      };
      send_friend_request: { Args: { p_friend_code: string }; Returns: string };
      set_featured_achievement: {
        Args: { p_achievement_key: string; p_featured: boolean };
        Returns: boolean;
      };
      unblock_friend: { Args: { p_friend_code: string }; Returns: boolean };
      unlock_habit_achievement: {
        Args: { p_key: string; p_user_id: string };
        Returns: boolean;
      };
      update_social_settings: {
        Args: {
          p_display_name: string;
          p_share_presence: boolean;
          p_share_progress: boolean;
        };
        Returns: boolean;
      };
      xp_for_level: { Args: { p_level: number }; Returns: number };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
