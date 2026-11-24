export type SocialOverview = {
  profile: {
    friend_code: string;
    display_name: string;
    share_progress: boolean;
    share_presence: boolean;
  };
  incoming: Array<{
    request_id: string;
    friend_code: string;
    display_name: string;
    created_at: string;
  }>;
  outgoing: Array<{
    friend_code: string;
    display_name: string;
    created_at: string;
  }>;
  blocked: Array<{
    friend_code: string;
    display_name: string;
  }>;
  friends: Array<{
    friend_code: string;
    display_name: string;
    share_progress: boolean;
    share_presence: boolean;
    is_online: boolean;
    current_habit: string | null;
    total_xp: number | null;
    level: number | null;
    top_habits: Array<{ name: string; completions: number }> | null;
    friend_since: string;
  }>;
};
