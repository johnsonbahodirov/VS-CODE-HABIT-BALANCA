export type HabitDurationError =
  "chooseStartDate" | "chooseEndDate" | "invalidEndDate" | "invalidDays";

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
  durationDays: string,
  startDate: string,
  endDate: string,
): HabitDurationError | null {
  if (!startDate) return "chooseStartDate";
  if (!durationDays && !endDate) return null;
  if (durationDays) {
    const days = Number(durationDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return "invalidDays";
  }
  if (!endDate) return "chooseEndDate";
  if (endDate < startDate) return "invalidEndDate";
  return null;
}
