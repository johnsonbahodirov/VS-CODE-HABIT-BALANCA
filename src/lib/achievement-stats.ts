import type { Database } from "@/integrations/supabase/types";
import {
  detectComeback,
  getLevelProgress,
  scheduledStreakStats,
  type AchievementUserStats,
} from "@/lib/gamification";

type Habit = Database["public"]["Tables"]["habits"]["Row"];
type HabitLog = Pick<
  Database["public"]["Tables"]["habit_logs"]["Row"],
  "habit_id" | "day" | "count"
>;

export function calculateAchievementUserStats(
  habits: Habit[],
  logs: HabitLog[],
  totalXp: number,
  today: string,
): AchievementUserStats {
  const completedLogs = logs.filter((log) => {
    const habit = habits.find((item) => item.id === log.habit_id);
    if (!habit) return (log.count ?? 1) >= 1;
    return habit.tracking_type === "count"
      ? (log.count ?? 0) >= habit.daily_goal_count
      : (log.count ?? 1) >= 1;
  });

  const completedDays = completedLogs.map((log) => log.day);
  const uniqueDays = new Set(completedDays);
  let longestStreak = 0;
  let longestLearningStreak = 0;

  for (const habit of habits) {
    const habitDays = completedLogs
      .filter((log) => log.habit_id === habit.id)
      .map((log) => log.day);
    const stats = scheduledStreakStats(habitDays, today, habit);
    if (stats.longest > longestStreak) longestStreak = stats.longest;

    const isLearning =
      habit.category.toLowerCase().includes("learn") ||
      habit.name.toLowerCase().includes("learn") ||
      habit.name.toLowerCase().includes("study");
    if (isLearning && stats.longest > longestLearningStreak) {
      longestLearningStreak = stats.longest;
    }
  }

  const matchingCompletions = (predicate: (category: string, name: string) => boolean) =>
    completedLogs.filter((log) => {
      const habit = habits.find((item) => item.id === log.habit_id);
      return predicate((habit?.category ?? "").toLowerCase(), (habit?.name ?? "").toLowerCase());
    }).length;

  const readingCompletions = matchingCompletions(
    (category, name) => category.includes("read") || name.includes("read") || name.includes("book"),
  );
  const learningCompletions = matchingCompletions(
    (category, name) =>
      category.includes("learn") || name.includes("learn") || name.includes("study"),
  );
  const workoutCompletions = matchingCompletions(
    (category, name) =>
      category.includes("fitness") ||
      category.includes("workout") ||
      name.includes("workout") ||
      name.includes("gym") ||
      name.includes("run") ||
      name.includes("fitness"),
  );
  const morningCompletions = completedLogs.filter((log) => {
    const habit = habits.find((item) => item.id === log.habit_id);
    return (
      (habit?.name ?? "").toLowerCase().includes("morning") ||
      (habit?.description ?? "").toLowerCase().includes("morning")
    );
  }).length;

  const comebackInfo = detectComeback(completedDays, today);
  const levelInfo = getLevelProgress(totalXp);

  return {
    habitsCount: habits.length,
    totalCompletions: completedLogs.length,
    morningCompletions,
    readingCompletions,
    learningCompletions,
    workoutCompletions,
    longestStreak,
    longestLearningStreak,
    perfectDaysCount: Math.min(
      uniqueDays.size,
      Math.floor(completedLogs.length / Math.max(1, habits.length)),
    ),
    activeUniqueDays: uniqueDays.size,
    totalXp,
    level: levelInfo.level,
    comebackCount: comebackInfo.comebackCycles,
    postComebackLongestStreak: comebackInfo.comebackCycles > 0 ? longestStreak : 0,
    postComebackActiveDays: comebackInfo.comebackCycles > 0 ? uniqueDays.size : 0,
    thirtyDayCompletionRate: Math.min(
      100,
      Math.round((completedLogs.length / Math.max(1, habits.length * 30)) * 100),
    ),
  };
}
