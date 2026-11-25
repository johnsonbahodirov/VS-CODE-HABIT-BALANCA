export const HABIT_DURATION_PRESETS = ["21", "30", "65", "90"] as const;

export type HabitDurationOption = "" | (typeof HABIT_DURATION_PRESETS)[number] | "custom";
export type HabitDurationError =
  "chooseDuration" | "chooseStartDate" | "chooseEndDate" | "invalidEndDate";

export function isHabitDurationPreset(
  value: HabitDurationOption,
): value is (typeof HABIT_DURATION_PRESETS)[number] {
  return HABIT_DURATION_PRESETS.some((preset) => preset === value);
}

export function habitEndDateAfterDays(startDate: string, days: number): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days - 1);
  return date.toISOString().slice(0, 10);
}

export function inclusiveHabitDurationDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86400000) + 1;
}

export function getHabitDurationError(
  option: HabitDurationOption,
  startDate: string,
  endDate: string,
): HabitDurationError | null {
  if (!option) return "chooseDuration";
  if (!startDate) return "chooseStartDate";
  if (!endDate) return "chooseEndDate";
  if (endDate < startDate) return "invalidEndDate";
  return null;
}
