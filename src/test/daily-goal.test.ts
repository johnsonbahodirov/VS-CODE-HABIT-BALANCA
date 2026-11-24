import { describe, expect, it } from "vitest";
import { dayKey } from "@/lib/balance";
import { wasBelowDailyGoalForThreeDays } from "@/lib/daily-goal";

describe("three-day daily goal suggestion", () => {
  const now = new Date(2026, 10, 4, 12);
  const previousDays = [1, 2, 3].map((offset) => {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    return dayKey(date);
  });

  it("suggests a smaller plan after three consecutive days below the goal", () => {
    const minutes = new Map(previousDays.map((day) => [day, 45]));
    expect(wasBelowDailyGoalForThreeDays(minutes, 60, now)).toBe(true);
  });

  it("does not suggest a smaller plan when one day met the goal", () => {
    const minutes = new Map(previousDays.map((day) => [day, 45]));
    minutes.set(previousDays[1]!, 60);
    expect(wasBelowDailyGoalForThreeDays(minutes, 60, now)).toBe(false);
  });

  it("counts a day with no tracked time as below the goal", () => {
    const minutes = new Map([[previousDays[0]!, 30]]);
    expect(wasBelowDailyGoalForThreeDays(minutes, 60, now)).toBe(true);
  });

  it("does not count today because the day is not complete", () => {
    const minutes = new Map([...previousDays, dayKey(now)].map((day) => [day, 60]));
    minutes.set(previousDays[0]!, 30);
    expect(wasBelowDailyGoalForThreeDays(minutes, 60, now)).toBe(false);
  });
});
