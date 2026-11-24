import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { SocialOverview } from "@/lib/social-types";
import { ACHIEVEMENTS, scheduledStreakStats, xpRewardsForCompletion } from "@/lib/gamification";
import { toast } from "sonner";

/** Colors offered in the picker. Old habits may still use the legacy colors below. */
export const HABIT_COLORS = [
  "#219B70",
  "#4779C7",
  "#8760C5",
  "#E05275",
  "#E5A323",
  "#269E9A",
  "#E56B45",
  "#5556A8",
  "#D94C9A",
  "#319CC4",
  "#16865F",
  "#7046AD",
] as const;

export type HabitColor = (typeof HABIT_COLORS)[number];

export const colorBg: Record<string, string> = {
  "#219B70": "bg-[#219B70]",
  "#4779C7": "bg-[#4779C7]",
  "#8760C5": "bg-[#8760C5]",
  "#E05275": "bg-[#E05275]",
  "#E5A323": "bg-[#E5A323]",
  "#269E9A": "bg-[#269E9A]",
  "#E56B45": "bg-[#E56B45]",
  "#5556A8": "bg-[#5556A8]",
  "#D94C9A": "bg-[#D94C9A]",
  "#319CC4": "bg-[#319CC4]",
  "#16865F": "bg-[#16865F]",
  "#7046AD": "bg-[#7046AD]",
  red: "bg-[#fb7185]",
  orange: "bg-[#dd865b]",
  amber: "bg-[#c9972e]",
  yellow: "bg-[#facc15]",
  lime: "bg-[#7caa4c]",
  green: "bg-[#4d9f72]",
  emerald: "bg-[#4ade80]",
  teal: "bg-[#469b8d]",
  cyan: "bg-habit-cyan",
  sky: "bg-[#4e97b5]",
  blue: "bg-[#5b7fbd]",
  indigo: "bg-[#6973b5]",
  violet: "bg-[#8a73b5]",
  purple: "bg-[#c084fc]",
  fuchsia: "bg-[#e879f9]",
  pink: "bg-[#c76f9d]",
  rose: "bg-[#d96f7c]",
  coral: "bg-[#d87864]",
  slate: "bg-[#73839a]",
  gray: "bg-[#9ca3af]",
  zinc: "bg-[#a1a1aa]",
  stone: "bg-[#a8a29e]",
};

/** Includes legacy colors so habits created before the palette was trimmed still render. */
export const HABIT_COLOR_VALUES: Record<string, string> = {
  "#219B70": "#219B70",
  "#4779C7": "#4779C7",
  "#8760C5": "#8760C5",
  "#E05275": "#E05275",
  "#E5A323": "#E5A323",
  "#269E9A": "#269E9A",
  "#E56B45": "#E56B45",
  "#5556A8": "#5556A8",
  "#D94C9A": "#D94C9A",
  "#319CC4": "#319CC4",
  "#16865F": "#16865F",
  "#7046AD": "#7046AD",
  red: "#fb7185",
  orange: "#dd865b",
  amber: "#c9972e",
  yellow: "#facc15",
  lime: "#7caa4c",
  green: "#4d9f72",
  emerald: "#4ade80",
  teal: "#469b8d",
  cyan: "#22d3ee",
  sky: "#4e97b5",
  blue: "#5b7fbd",
  indigo: "#6973b5",
  violet: "#8a73b5",
  purple: "#c084fc",
  fuchsia: "#e879f9",
  pink: "#c76f9d",
  rose: "#d96f7c",
  coral: "#d87864",
  slate: "#73839a",
  gray: "#9ca3af",
  zinc: "#a1a1aa",
  stone: "#a8a29e",
};

function mutationErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const record = error as {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
      status?: number;
    };
    console.error("Habit Balance mutation failed", record);

    if (record.code === "23505") {
      if (/name|habit/i.test(`${record.message} ${record.details}`)) {
        return "A habit with this name already exists.";
      }
      return "That habit already exists.";
    }
    if (record.code === "23514") {
      if (/color/i.test(`${record.message} ${record.details}`)) {
        return "This color is not allowed.";
      }
      if (/category/i.test(`${record.message} ${record.details}`)) {
        return "This category is not allowed.";
      }
      if (/icon/i.test(`${record.message} ${record.details}`)) {
        return "This icon is not allowed.";
      }
      if (/daily_goal/i.test(`${record.message} ${record.details}`)) {
        return "Enter a valid daily focus goal.";
      }
      return "One of the habit values is not valid.";
    }
    if (record.code === "42501" || record.status === 401 || record.status === 403) {
      return "You do not have permission to save this habit.";
    }
    if (/maximum|limit|too many/i.test(`${record.message} ${record.details}`)) {
      return record.message || "This habit cannot be added because a limit was reached.";
    }
  }
  console.error("Habit Balance mutation failed", error);
  if (
    error instanceof Error &&
    error.message === "Habit entries can only be changed within 30 hours."
  ) {
    return error.message;
  }
  return "Could not save. Please try again.";
}

const err = (error: unknown) => toast.error(mutationErrorMessage(error));

export function useSocialOverview() {
  return useQuery({
    queryKey: ["social-overview"],
    queryFn: async (): Promise<SocialOverview> => {
      const { data, error } = await supabase.rpc("get_social_overview");
      if (error) throw error;
      return data as unknown as SocialOverview;
    },
    refetchInterval: 30_000,
  });
}

export function useUpdateSocialSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: {
      displayName: string;
      shareProgress: boolean;
      sharePresence: boolean;
    }) => {
      const { error } = await supabase.rpc("update_social_settings", {
        p_display_name: settings.displayName,
        p_share_progress: settings.shareProgress,
        p_share_presence: settings.sharePresence,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-overview"] }),
    onError: err,
  });
}

export function useSendFriendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (friendCode: string) => {
      const { data, error } = await supabase.rpc("send_friend_request", {
        p_friend_code: friendCode,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-overview"] }),
    onError: err,
  });
}

export function useRespondFriendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (request: { requestId: string; accept: boolean }) => {
      const { data, error } = await supabase.rpc("respond_friend_request", {
        p_request_id: request.requestId,
        p_accept: request.accept,
      });
      if (error) throw error;
      if (!data) throw new Error("This friend request is no longer available.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-overview"] }),
    onError: err,
  });
}

export function useRemoveFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (friendCode: string) => {
      const { data, error } = await supabase.rpc("remove_friend", {
        p_friend_code: friendCode,
      });
      if (error) throw error;
      if (!data) throw new Error("This friend is no longer in your friends list.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-overview"] }),
    onError: err,
  });
}

export function useBlockFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (friendCode: string) => {
      const { data, error } = await supabase.rpc("block_friend", {
        p_friend_code: friendCode,
      });
      if (error) throw error;
      if (!data) throw new Error("Could not block this account.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-overview"] }),
    onError: err,
  });
}

export function useUnblockFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (friendCode: string) => {
      const { data, error } = await supabase.rpc("unblock_friend", {
        p_friend_code: friendCode,
      });
      if (error) throw error;
      if (!data) throw new Error("This account is no longer blocked.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-overview"] }),
    onError: err,
  });
}

export type AppSettings = {
  daily_goal_minutes: number;
  pomodoro_focus_minutes: number;
  pomodoro_short_break_minutes: number;
  pomodoro_long_break_minutes: number;
  reminder_enabled: boolean;
  reminder_time: string;
  timezone: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  daily_goal_minutes: 120,
  pomodoro_focus_minutes: 25,
  pomodoro_short_break_minutes: 5,
  pomodoro_long_break_minutes: 15,
  reminder_enabled: false,
  reminder_time: "09:00",
  timezone: "UTC",
};

// Reads the locally cached session instead of a network round trip on every tap.
async function getSessionUser() {
  const { data, error } = await supabase.auth.getSession();
  return { data: { user: data.session?.user ?? null }, error };
}
const HABIT_EDIT_WINDOW_MS = 30 * 60 * 60 * 1000;

async function getHabitCompletionAge(habitId: string, day: string) {
  const { data, error } = await supabase
    .from("habit_logs")
    .select("completed_at")
    .eq("habit_id", habitId)
    .eq("day", day)
    .maybeSingle();

  if (error) throw error;

  if (!data?.completed_at) return 0;
  return Date.now() - new Date(data.completed_at).getTime();
}

export function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const syncedTimezones = new Set<string>();
async function syncSettingsTimezone(userId: string, timezone: string): Promise<void> {
  const key = `${userId}:${timezone}`;
  if (syncedTimezones.has(key)) return;
  try {
    await syncSettingsTimezoneOnce(userId, timezone);
    syncedTimezones.add(key);
  } catch (error) {
    console.warn("Timezone sync deferred:", error);
  }
}

async function syncSettingsTimezoneOnce(userId: string, timezone: string): Promise<void> {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, timezone }, { onConflict: "user_id" });
  if (error) throw error;
}

export function useHabits() {
  return useQuery({
    queryKey: ["habits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("habits").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useHabitLogs() {
  return useQuery({
    queryKey: ["habit_logs"],
    queryFn: async () => {
      const allLogs = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("habit_logs")
          .select("habit_id, day, count, completed_at")
          .order("day")
          .order("habit_id")
          .range(offset, offset + 999);
        if (error) throw error;
        allLogs.push(...data);
        if (data.length < 1000) return allLogs;
      }
    },
  });
}

export function useHabitNotes() {
  return useQuery({
    queryKey: ["habit_notes"],
    queryFn: async () => {
      const allNotes = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("habit_notes")
          .select("habit_id, day, note")
          .order("day")
          .order("habit_id")
          .range(offset, offset + 999);
        if (error) throw error;
        allNotes.push(...data);
        if (data.length < 1000) return allNotes;
      }
    },
  });
}

export function useSaveHabitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: { habit_id: string; day: string; note: string }) => {
      const { error } = await supabase
        .from("habit_notes")
        .upsert({ ...value, updated_at: new Date().toISOString() }, { onConflict: "habit_id,day" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["habit_notes"] }),
    onError: err,
  });
}

export function useDayNotes() {
  return useQuery({
    queryKey: ["day_notes"],
    queryFn: async () => {
      const allNotes = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("day_notes")
          .select("day, note")
          .order("day")
          .range(offset, offset + 999);
        if (error) throw error;
        allNotes.push(...data);
        if (data.length < 1000) return allNotes;
      }
    },
  });
}

export function useSaveDayNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: { day: string; note: string }) => {
      const note = value.note.trim();
      const request =
        note.length > 0
          ? supabase.from("day_notes").upsert(
              { ...value, note, updated_at: new Date().toISOString() },
              {
                onConflict: "user_id,day",
              },
            )
          : supabase.from("day_notes").delete().eq("day", value.day);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["day_notes"] }),
    onError: err,
  });
}

export function useXPSummary() {
  return useQuery({
    queryKey: ["xp"],
    queryFn: async () => {
      const [{ data: account, error: accountError }, { data: transactions, error: txError }] =
        await Promise.all([
          supabase.from("user_xp").select("total_xp").maybeSingle(),
          supabase
            .from("xp_transactions")
            .select("id, amount, reason, created_at, day, habit_id")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(30),
        ]);
      if (accountError) throw accountError;
      if (txError) throw txError;
      return { totalXp: Number(account?.total_xp ?? 0), transactions: transactions ?? [] };
    },
  });
}

export function useXPHistory() {
  return useQuery({
    queryKey: ["xp-history"],
    queryFn: async () => {
      const transactions = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("xp_transactions")
          .select("id, amount, reason, created_at, day, habit_id")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        transactions.push(...data);
        if (data.length < 1000) return transactions;
      }
    },
  });
}

export function useDailyXP(day: string) {
  return useQuery({
    queryKey: ["xp-daily", day],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("xp_transactions")
        .select("amount")
        .eq("day", day);
      if (error) throw error;

      return (data ?? []).reduce((total, transaction) => total + transaction.amount, 0);
    },
  });
}

export function useXPTransactionsBetween(startDay: string, endDay: string) {
  return useQuery({
    queryKey: ["xp-history", startDay, endDay],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("xp_transactions")
        .select("id, amount, reason, created_at, day")
        .gte("day", startDay)
        .lte("day", endDay)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAchievements() {
  return useQuery({
    queryKey: ["achievements"],
    queryFn: async () => {
      const [{ data: catalog, error: catalogError }, { data: unlocked, error: unlockedError }] =
        await Promise.all([
          supabase.from("achievements").select("*").order("sort_order"),
          supabase.from("user_achievements").select("achievement_key, unlocked_at, is_featured"),
        ]);
      if (catalogError) throw catalogError;
      if (unlockedError) throw unlockedError;

      const remoteMap = new Map((catalog ?? []).map((c) => [c.key, c]));
      const fullCatalog = ACHIEVEMENTS.map((local) => {
        const remote = remoteMap.get(local.key);
        return {
          key: local.key,
          name: remote?.name ?? local.name,
          description: remote?.description ?? local.description,
          reward_xp: remote?.reward_xp ?? local.rewardXp,
          rewardXp: remote?.reward_xp ?? local.rewardXp,
          tier: remote?.tier ?? local.tier,
          category: (remote as { category?: string } | undefined)?.category ?? local.category,
          sort_order: remote?.sort_order ?? local.sortOrder,
          sortOrder: remote?.sort_order ?? local.sortOrder,
          target: local.target,
          unit: local.unit,
        };
      });

      return { catalog: fullCatalog, unlocked: unlocked ?? [] };
    },
  });
}

export function useAddHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      name: string;
      color: string;
      category: string;
      icon: string;
      description: string;
      frequency: "daily" | "weekdays" | "selected_days" | "custom";
      schedule_days: number[];
      difficulty: "easy" | "medium" | "hard";
      reminder_enabled: boolean;
      reminder_time: string;
      start_date: string;
      end_date: string | null;
      daily_goal_minutes?: number;
      habit_type?: "yesno" | "timed";
      tracking_type: "yes_no" | "count";
      daily_goal_count: number;
    }) => {
      const { error } = await supabase.from("habits").insert(v);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["xp"] });
      qc.invalidateQueries({ queryKey: ["xp-history"] });
      qc.invalidateQueries({ queryKey: ["achievements"] });
    },
    onError: err,
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("habits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Habit deleted");
    },
    onError: err,
  });
}

export function useUpdateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: {
      id: string;
      updates: Database["public"]["Tables"]["habits"]["Update"];
    }) => {
      const { error } = await supabase.from("habits").update(value.updates).eq("id", value.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["habits"] }),
    onError: err,
  });
}

export function useSetAchievementFeatured() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: { achievement_key: string; featured: boolean }) => {
      const { error } = await supabase.rpc("set_featured_achievement", {
        p_achievement_key: value.achievement_key,
        p_featured: value.featured,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["achievements"] }),
    onError: err,
  });
}

export function useToggleLog() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (v: {
      habit_id: string;
      day: string;
      done: boolean;
      count?: number;
      completed_at?: string | null;
      currentCount?: number;
    }) => {
      type Log = {
        habit_id: string;
        day: string;
        count?: number | null;
        completed_at?: string | null;
      };
      const cachedLog = qc
        .getQueryData<Log[]>(["habit_logs"])
        ?.find((log) => log.habit_id === v.habit_id && log.day === v.day);
      const habit = qc
        .getQueryData<Database["public"]["Tables"]["habits"]["Row"][]>(["habits"])
        ?.find((item) => item.id === v.habit_id);
      const previousCount = v.currentCount ?? cachedLog?.count ?? 0;
      const xpCanChange =
        v.count === undefined ||
        v.count <= 0 ||
        !habit ||
        (v.count >= habit.daily_goal_count && previousCount < habit.daily_goal_count);
      const completionTime = v.completed_at ? { completed_at: v.completed_at } : cachedLog;
      const agePromise = completionTime
        ? Promise.resolve(
            completionTime.completed_at
              ? Date.now() - new Date(completionTime.completed_at).getTime()
              : 0,
          )
        : getHabitCompletionAge(v.habit_id, v.day);
      const [age, xpBefore] = await Promise.all([
        agePromise,
        xpCanChange ? readHabitXpSnapshot(v.habit_id, v.day) : Promise.resolve(null),
      ]);
      if (age > HABIT_EDIT_WINDOW_MS) {
        throw new Error("Habit entries can only be changed within 30 hours.");
      }

      const getXpChange = async () => {
        if (!xpBefore) return { delta: 0, totalDelta: 0 };
        const xpAfter = await readHabitXpSnapshot(v.habit_id, v.day);
        const transactionXp = (rows: typeof xpBefore.transactions) =>
          rows.reduce((total, row) => total + row.amount, 0);
        return {
          delta: transactionXp(xpAfter.transactions) - transactionXp(xpBefore.transactions),
          totalDelta: xpAfter.totalXp - xpBefore.totalXp,
        };
      };

      if (v.count !== undefined) {
        if (v.count <= 0) {
          const { error: deleteError } = await supabase
            .from("habit_logs")
            .delete()
            .eq("habit_id", v.habit_id)
            .eq("day", v.day);

          if (deleteError) throw deleteError;

          const { error: revokeError } = await supabase.rpc("revoke_habit_completion_xp", {
            p_habit_id: v.habit_id,
            p_day: v.day,
          });

          if (revokeError) throw revokeError;
          return await getXpChange();
        }

        const { data: auth, error: authError } = await getSessionUser();
        if (authError) throw authError;
        if (!auth.user) throw new Error("Sign in to update a habit.");

        void syncSettingsTimezone(auth.user.id, getLocalTimezone());

        const { error } = await supabase.from("habit_logs").upsert(
          {
            habit_id: v.habit_id,
            day: v.day,
            count: v.count,
            user_id: auth.user.id,
          },
          { onConflict: "habit_id,day" },
        );

        if (error) throw error;
        return await getXpChange();
      }

      if (v.done) {
        const { error: revokeError } = await supabase.rpc("revoke_habit_completion_xp", {
          p_habit_id: v.habit_id,
          p_day: v.day,
        });

        if (revokeError) throw revokeError;
      } else {
        const { data: auth, error: authError } = await getSessionUser();
        if (authError) throw authError;
        if (!auth.user) throw new Error("Sign in to complete a habit.");

        void syncSettingsTimezone(auth.user.id, getLocalTimezone());

        const { error } = await supabase.from("habit_logs").insert({
          habit_id: v.habit_id,
          day: v.day,
          count: 1,
          completed_at: new Date().toISOString(),
        });

        if (error) throw error;
      }

      return await getXpChange();
    },

    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["habit_logs"] });

      type Log = {
        habit_id: string;
        day: string;
        count: number | null;
        completed_at?: string | null;
      };

      const logs = qc.getQueryData<Log[]>(["habit_logs"]);
      const previousLog = logs?.find((log) => log.habit_id === v.habit_id && log.day === v.day);
      const habit = qc
        .getQueryData<Database["public"]["Tables"]["habits"]["Row"][]>(["habits"])
        ?.find((item) => item.id === v.habit_id);
      const previousCount = previousLog?.count ?? 0;
      const reachesGoal =
        habit?.tracking_type === "count"
          ? previousCount < habit.daily_goal_count &&
            (v.count ?? previousCount) >= habit.daily_goal_count
          : v.count === undefined && !v.done && !previousLog;
      let optimisticXp = 0;

      if (logs && habit && reachesGoal) {
        const completedDays = logs
          .filter((log) => {
            if (log.habit_id !== habit.id) return false;
            return habit.tracking_type !== "count" || (log.count ?? 0) >= habit.daily_goal_count;
          })
          .map((log) => log.day);
        const previousStreak = scheduledStreakStats(completedDays, v.day, habit).current;
        optimisticXp = xpRewardsForCompletion(
          habit.id,
          v.day,
          previousStreak + 1,
          habit.difficulty,
        ).reduce((total, reward) => total + reward.amount, 0);
      }

      if (logs) {
        const remaining = logs.filter((log) => !(log.habit_id === v.habit_id && log.day === v.day));
        const remove = v.count !== undefined ? v.count <= 0 : v.done;
        const next = remove
          ? remaining
          : [
              ...remaining,
              {
                habit_id: v.habit_id,
                day: v.day,
                count: v.count !== undefined ? v.count : 1,
                completed_at: previousLog?.completed_at ?? new Date().toISOString(),
              },
            ].sort(
              (left, right) =>
                left.day.localeCompare(right.day) || left.habit_id.localeCompare(right.habit_id),
            );
        qc.setQueryData<Log[]>(["habit_logs"], next);
      }

      if (optimisticXp > 0) {
        qc.setQueryData<{ totalXp: number; transactions: unknown[] }>(["xp"], (current) =>
          current ? { ...current, totalXp: current.totalXp + optimisticXp } : current,
        );
        qc.setQueryData<number>(["xp-daily", v.day], (current) =>
          current === undefined ? current : current + optimisticXp,
        );
      }

      return { previousLog, optimisticXp, day: v.day };
    },

    onSuccess: (result, _variables, context) => {
      const correction = result.totalDelta - (context?.optimisticXp ?? 0);
      if (correction !== 0) {
        qc.setQueryData<{ totalXp: number; transactions: unknown[] }>(["xp"], (current) =>
          current ? { ...current, totalXp: Math.max(0, current.totalXp + correction) } : current,
        );
      }
    },

    onSettled: (data, error, variables) => {
      if (error || data?.delta || data?.totalDelta) {
        qc.invalidateQueries({ queryKey: ["xp"] });
        qc.invalidateQueries({ queryKey: ["xp-history"] });
        qc.invalidateQueries({ queryKey: ["xp-daily", variables.day] });
        qc.invalidateQueries({ queryKey: ["achievements"] });
      }
    },

    onError: (e, variables, ctx) => {
      if (ctx) {
        qc.setQueryData<
          Array<{
            habit_id: string;
            day: string;
            count: number | null;
            completed_at?: string | null;
          }>
        >(["habit_logs"], (current) => {
          if (!current) return current;
          const withoutOptimistic = current.filter(
            (log) => !(log.habit_id === variables.habit_id && log.day === variables.day),
          );
          return ctx.previousLog
            ? [...withoutOptimistic, ctx.previousLog].sort(
                (left, right) =>
                  left.day.localeCompare(right.day) || left.habit_id.localeCompare(right.habit_id),
              )
            : withoutOptimistic;
        });
        if (ctx.optimisticXp > 0) {
          qc.setQueryData<{ totalXp: number; transactions: unknown[] }>(["xp"], (current) =>
            current
              ? { ...current, totalXp: Math.max(0, current.totalXp - ctx.optimisticXp) }
              : current,
          );
          qc.setQueryData<number>(["xp-daily", ctx.day], (current) =>
            current === undefined ? current : Math.max(0, current - ctx.optimisticXp),
          );
        }
      }
      qc.invalidateQueries({ queryKey: ["habit_logs"] });
      err(e);
    },
  });
}

async function readHabitXpSnapshot(habitId: string, day: string) {
  const [{ data: account, error: accountError }, { data: transactions, error: transactionsError }] =
    await Promise.all([
      supabase.from("user_xp").select("total_xp").maybeSingle(),
      supabase.from("xp_transactions").select("id, amount").eq("habit_id", habitId).eq("day", day),
    ]);
  if (accountError) throw accountError;
  if (transactionsError) throw transactionsError;
  return { totalXp: Number(account?.total_xp ?? 0), transactions: transactions ?? [] };
}

export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const allSessions = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("work_sessions")
          .select("*")
          .order("started_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        allSessions.push(...data);
        if (data.length < 1000) return allSessions;
      }
    },
  });
}

export function useTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      runningId: string | null;
      habitId?: string | null;
      mode?: "stopwatch" | "pomodoro";
      endedAt?: string | null;
    }) => {
      if (v.runningId) {
        const { error } = await supabase
          .from("work_sessions")
          .update({ ended_at: v.endedAt ?? new Date().toISOString() })
          .eq("id", v.runningId);
        if (error) throw error;
      } else {
        const { data: activeSession, error: activeError } = await supabase
          .from("work_sessions")
          .select("id")
          .is("ended_at", null)
          .limit(1)
          .maybeSingle();
        if (activeError) throw activeError;
        if (activeSession)
          throw new Error("A timer is already running. Stop it before starting another.");
        const { error } = await supabase
          .from("work_sessions")
          .insert({ habit_id: v.habitId ?? null, mode: v.mode ?? "stopwatch" });
        if (error) {
          if (
            error.code === "23505" ||
            error.message?.includes("work_sessions_one_active_per_user")
          ) {
            throw new Error("A timer is already running. Stop it before starting another.");
          }
          throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["xp"] });
      qc.invalidateQueries({ queryKey: ["xp-history"] });
    },
    onError: err,
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    onError: err,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data: auth, error: authError } = await getSessionUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sign in to load your settings.");
      const timezone = getLocalTimezone();
      const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
      if (error) throw error;
      if (!data) {
        await syncSettingsTimezone(auth.user.id, timezone);
        const { data: inserted, error: insertError } = await supabase
          .from("user_settings")
          .select("*")
          .single();
        if (insertError) throw insertError;
        return { ...DEFAULT_SETTINGS, ...inserted };
      }
      if (data.timezone !== timezone) {
        const { error: updateError } = await supabase
          .from("user_settings")
          .update({ timezone })
          .eq("user_id", auth.user.id);
        if (updateError) throw updateError;
      }
      return { ...DEFAULT_SETTINGS, ...data, timezone };
    },
  });
}

export function useSaveTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mins: number) => {
      const { data: auth, error: authError } = await getSessionUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sign in to update your daily goal.");
      const timezone = getLocalTimezone();
      await syncSettingsTimezone(auth.user.id, timezone);
      const { error } = await supabase
        .from("user_settings")
        .update({ daily_goal_minutes: mins })
        .eq("user_id", auth.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Daily time goal saved");
    },
    onError: err,
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<AppSettings>) => {
      const { data: auth, error: authError } = await getSessionUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sign in to update your settings.");
      const timezone = getLocalTimezone();
      await syncSettingsTimezone(auth.user.id, timezone);
      const { error } = await supabase
        .from("user_settings")
        .update(settings)
        .eq("user_id", auth.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
    onError: err,
  });
}

export function useSavePushSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subscription: PushSubscription) => {
      const { data: auth, error: authError } = await getSessionUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sign in to enable reminders.");
      const serialized = JSON.parse(JSON.stringify(subscription.toJSON())) as Json;
      const { error } = await supabase
        .from("reminder_subscriptions")
        .upsert(
          { user_id: auth.user.id, endpoint: subscription.endpoint, subscription: serialized },
          { onConflict: "endpoint" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
    onError: err,
  });
}
