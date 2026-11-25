import { describe, expect, it } from "vitest";
import { calculateWeeklyInsights } from "@/lib/stats-insights";

describe("weekly Stats insights", () => {
  it("compares completion rates using scheduled, non-skipped days only", () => {
    const habits = [
      { id: "daily", name: "Daily", frequency: "daily", skipped_dates: ["2026-11-25"] },
      {
        id: "weekdays",
        name: "Weekdays",
        frequency: "selected_days",
        schedule_days: [1, 2, 3, 4, 5],
      },
    ];
    const currentWeek = [
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ];
    const previousWeek = [
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ];

    const insights = calculateWeeklyInsights(
      habits,
      new Set(["daily|2026-11-23", "weekdays|2026-11-24"]),
      currentWeek,
      previousWeek,
      "2026-11-29",
    );

    expect(insights.completionRate).toBe(18);
    expect(insights.previousCompletionRate).toBe(0);
    expect(insights.completionRateChange).toBe(18);
    expect(insights.bestWeekday).toEqual({
      weekdayIndex: 0,
      completed: 1,
      scheduled: 2,
      completionRate: 50,
    });
    expect(insights.mostMissedHabit).toEqual({
      habitId: "daily",
      name: "Daily",
      missed: 5,
      scheduled: 6,
    });
  });

  it("ignores future days and returns null insights without missed scheduled habits", () => {
    expect(
      calculateWeeklyInsights(
        [{ id: "done", name: "Done", frequency: "daily" }],
        new Set(["done|2026-11-25", "done|2026-11-24"]),
        ["2026-11-25", "2026-11-26"],
        ["2026-11-24"],
        "2026-11-25",
      ),
    ).toEqual({
      completionRate: 100,
      previousCompletionRate: 100,
      completionRateChange: 0,
      bestWeekday: {
        weekdayIndex: 2,
        completed: 1,
        scheduled: 1,
        completionRate: 100,
      },
      mostMissedHabit: null,
    });
  });
});
