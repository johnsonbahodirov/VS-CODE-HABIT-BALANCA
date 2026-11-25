import { endOfMonth, startOfMonth, startOfWeek } from "date-fns";

export type StatsRange = "day" | "week" | "month" | "3months" | "6months" | "year";

export type StatsPeriod = {
  startDay: string;
  endDay: string;
  elapsedEndDay: string | null;
  fullDays: string[];
  elapsedDays: string[];
  previousDays: string[];
};

function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDayKey(day: string): Date {
  return new Date(`${day}T12:00:00`);
}

function daysBetween(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0);
  const last = new Date(end);
  last.setHours(12, 0, 0, 0);
  for (; cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    days.push(toDayKey(cursor));
  }
  return days;
}

function boundsFor(day: Date, range: StatsRange): { start: Date; end: Date } {
  const selected = new Date(day);
  selected.setHours(12, 0, 0, 0);
  if (range === "day") return { start: selected, end: selected };
  if (range === "week") {
    const start = startOfWeek(selected, { weekStartsOn: 1 });
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }
  if (range === "month") return { start: startOfMonth(selected), end: endOfMonth(selected) };

  const monthCount = range === "3months" ? 3 : range === "6months" ? 6 : 12;
  const start = new Date(selected.getFullYear(), selected.getMonth() - monthCount + 1, 1, 12);
  return { start: startOfMonth(start), end: endOfMonth(selected) };
}

export function getStatsPeriod(selectedDay: string, range: StatsRange, today: string): StatsPeriod {
  const { start, end } = boundsFor(fromDayKey(selectedDay), range);
  const fullDays = daysBetween(start, end);
  const elapsedDays = fullDays.filter((day) => day <= today);
  const previousDays: string[] = [];
  if (elapsedDays.length) {
    const previousEnd = new Date(start);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - elapsedDays.length + 1);
    previousDays.push(...daysBetween(previousStart, previousEnd));
  }
  return {
    startDay: toDayKey(start),
    endDay: toDayKey(end),
    elapsedEndDay: elapsedDays[elapsedDays.length - 1] ?? null,
    fullDays,
    elapsedDays,
    previousDays,
  };
}

export function getCustomElapsedDays(
  startDay: string,
  endDay: string,
  today: string,
  maxDays = 366,
): string[] {
  if (!startDay || !endDay || endDay < startDay) return [];
  const clampedEndDay = endDay > today ? today : endDay;
  const boundedStart = fromDayKey(startDay);
  const latestStart = fromDayKey(clampedEndDay);
  latestStart.setDate(latestStart.getDate() - Math.max(1, maxDays) + 1);
  if (boundedStart < latestStart) boundedStart.setTime(latestStart.getTime());
  return daysBetween(boundedStart, fromDayKey(clampedEndDay));
}
