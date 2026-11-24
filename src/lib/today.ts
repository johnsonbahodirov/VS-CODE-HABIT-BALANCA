import { dayKey } from "@/lib/balance";
import { isHabitScheduledOnDay } from "@/lib/gamification";

export type TodayHabit = {
  id: string;
  archived_at?: string | null;
  created_at?: string | null;
  daily_goal_minutes?: number | null;
  frequency?: string | null;
  habit_type?: string | null;
  is_paused?: boolean | null;
  schedule_days?: number[] | null;
};

export type DayState = "done" | "missed" | "pending" | "future" | "off";

export function getWeekDayKeys(today: Date): string[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return dayKey(date);
  });
}

export function getWeekStrip(
  habit: TodayHabit,
  completedDays: ReadonlySet<string>,
  today: Date,
): DayState[] {
  const todayKey = dayKey(today);

  return getWeekDayKeys(today).map((day) => {
    if (!isHabitScheduledOnDay(habit, day)) return "off";
    if (day > todayKey) return "future";
    if (completedDays.has(day)) return "done";
    if (day === todayKey) return "pending";
    return "missed";
  });
}

export function isTimedHabit(habit: TodayHabit): boolean {
  if (habit.habit_type === "timed") return true;
  if (habit.habit_type === "yesno") return false;
  return (habit.daily_goal_minutes ?? 0) > 0;
}

export function getTodayHabits<T extends TodayHabit>(habits: T[], day: string): T[] {
  return habits.filter(
    (habit) => !habit.is_paused && !habit.archived_at && isHabitScheduledOnDay(habit, day),
  );
}

export function getTodayFocusPlan(
  habits: TodayHabit[],
  minutesByHabitDay: ReadonlyMap<string, number>,
  day: string,
): { plannedMinutes: number; completedMinutes: number; percentage: number } {
  const timedHabits = getTodayHabits(habits, day).filter(isTimedHabit);
  const plannedMinutes = timedHabits.reduce(
    (total, habit) => total + Math.max(0, habit.daily_goal_minutes ?? 0),
    0,
  );
  const completedMinutes = timedHabits.reduce(
    (total, habit) => total + Math.max(0, minutesByHabitDay.get(`${habit.id}|${day}`) ?? 0),
    0,
  );

  return {
    plannedMinutes,
    completedMinutes,
    percentage:
      plannedMinutes > 0 ? Math.min(100, Math.round((completedMinutes / plannedMinutes) * 100)) : 0,
  };
}
