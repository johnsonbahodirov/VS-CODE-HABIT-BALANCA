import { dayKey } from "@/lib/balance";

export function wasBelowDailyGoalForThreeDays(
  minutesByDay: ReadonlyMap<string, number>,
  dailyGoal: number,
  now: Date,
): boolean {
  return [1, 2, 3].every((offset) => {
    const day = new Date(now);
    day.setDate(day.getDate() - offset);
    return (minutesByDay.get(dayKey(day)) ?? 0) < dailyGoal;
  });
}
