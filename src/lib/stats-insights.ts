import { isHabitScheduledOnDay } from "@/lib/gamification";
import { isHabitSkippedOnDay, type TodayHabit } from "@/lib/today";

type InsightHabit = TodayHabit & { name: string };

type WeekdayInsight = {
  weekdayIndex: number;
  completed: number;
  scheduled: number;
  completionRate: number;
};

type HabitMissInsight = {
  habitId: string;
  name: string;
  missed: number;
  scheduled: number;
};

function getCompletionRate(
  habits: InsightHabit[],
  completions: ReadonlySet<string>,
  dates: string[],
  today: string,
) {
  let completed = 0;
  let scheduled = 0;
  for (const date of dates) {
    if (date > today) continue;
    for (const habit of habits) {
      if (!isHabitScheduledOnDay(habit, date) || isHabitSkippedOnDay(habit, date)) continue;
      scheduled += 1;
      if (completions.has(`${habit.id}|${date}`)) completed += 1;
    }
  }
  return {
    completed,
    scheduled,
    completionRate: scheduled ? Math.round((completed / scheduled) * 100) : 0,
  };
}

export function calculateWeeklyInsights(
  habits: InsightHabit[],
  completions: ReadonlySet<string>,
  currentWeekDays: string[],
  previousWeekDays: string[],
  today: string,
): {
  completionRate: number;
  previousCompletionRate: number;
  completionRateChange: number;
  bestWeekday: WeekdayInsight | null;
  mostMissedHabit: HabitMissInsight | null;
} {
  const current = getCompletionRate(habits, completions, currentWeekDays, today);
  const previous = getCompletionRate(habits, completions, previousWeekDays, today);
  const weekdays = currentWeekDays.flatMap((date) => {
    if (date > today) return [];
    const weekdayIndex = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    const stats = getCompletionRate(habits, completions, [date], today);
    return stats.scheduled ? [{ weekdayIndex, ...stats }] : [];
  });
  const bestWeekday =
    weekdays.sort(
      (left, right) =>
        right.completionRate - left.completionRate || right.completed - left.completed,
    )[0] ?? null;

  const missedByHabit = habits
    .map((habit) => {
      const dates = currentWeekDays.filter(
        (date) =>
          date <= today && isHabitScheduledOnDay(habit, date) && !isHabitSkippedOnDay(habit, date),
      );
      const completed = dates.filter((date) => completions.has(`${habit.id}|${date}`)).length;
      return {
        habitId: habit.id,
        name: habit.name,
        missed: dates.length - completed,
        scheduled: dates.length,
      };
    })
    .filter((habit) => habit.missed > 0)
    .sort((left, right) => right.missed - left.missed);

  return {
    completionRate: current.completionRate,
    previousCompletionRate: previous.completionRate,
    completionRateChange: current.completionRate - previous.completionRate,
    bestWeekday,
    mostMissedHabit: missedByHabit[0] ?? null,
  };
}
