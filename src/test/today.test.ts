import { describe, expect, it } from "vitest";
import {
  getTodayFocusPlan,
  getTodayHabits,
  getWeekDayKeys,
  getWeekStrip,
  isTimedHabit,
} from "@/lib/today";

describe("Today habit calculations", () => {
  const today = "2026-11-22";

  it("uses the stored habit type and falls back to legacy focus goals", () => {
    expect(isTimedHabit({ id: "timed", habit_type: "timed", daily_goal_minutes: 0 })).toBe(true);
    expect(isTimedHabit({ id: "yesno", habit_type: "yesno", daily_goal_minutes: 30 })).toBe(false);
    expect(isTimedHabit({ id: "legacy", daily_goal_minutes: 20 })).toBe(true);
    expect(isTimedHabit({ id: "legacy-yesno", daily_goal_minutes: 0 })).toBe(false);
  });

  it("filters paused, out-of-range, and unscheduled habits from Today", () => {
    const habits = [
      { id: "today", frequency: "selected_days", schedule_days: [0] },
      { id: "other-day", frequency: "selected_days", schedule_days: [1] },
      { id: "paused", frequency: "selected_days", schedule_days: [0], is_paused: true },
      { id: "future", start_date: "2026-11-23" },
      { id: "finished", end_date: "2026-11-21" },
    ];

    expect(getTodayHabits(habits, today).map((habit) => habit.id)).toEqual(["today"]);
  });

  it("includes the end date itself but not later dates", () => {
    expect(getTodayHabits([{ id: "ends-today", end_date: today }], today)).toHaveLength(1);
    expect(getTodayHabits([{ id: "ended-yesterday", end_date: "2026-11-21" }], today)).toHaveLength(
      0,
    );
  });

  it("treats a selected-days schedule with no days as every day", () => {
    expect(
      getTodayHabits([{ id: "empty", frequency: "selected_days", schedule_days: [] }], today),
    ).toHaveLength(1);
  });

  it("derives planned and completed time only from today's scheduled timed habits", () => {
    const habits = [
      {
        id: "one",
        frequency: "selected_days",
        habit_type: "timed",
        daily_goal_minutes: 60,
        schedule_days: [0],
      },
      {
        id: "two",
        frequency: "selected_days",
        habit_type: "timed",
        daily_goal_minutes: 30,
        schedule_days: [0],
      },
      {
        id: "yesno",
        frequency: "selected_days",
        habit_type: "yesno",
        daily_goal_minutes: 0,
        schedule_days: [0],
      },
      {
        id: "other-day",
        frequency: "selected_days",
        habit_type: "timed",
        daily_goal_minutes: 120,
        schedule_days: [1],
      },
    ];

    expect(
      getTodayFocusPlan(
        habits,
        new Map([
          ["one|2026-11-22", 45],
          ["two|2026-11-22", 60],
          ["other-day|2026-11-22", 120],
        ]),
        today,
      ),
    ).toEqual({ plannedMinutes: 90, completedMinutes: 105, percentage: 100 });
  });

  it("returns an empty plan without dividing by zero", () => {
    expect(getTodayFocusPlan([{ id: "yesno", habit_type: "yesno" }], new Map(), today)).toEqual({
      plannedMinutes: 0,
      completedMinutes: 0,
      percentage: 0,
    });
  });

  it("builds a Monday-to-Sunday strip with completed, missed, pending, and future days", () => {
    const todayDate = new Date(2026, 10, 25, 12);
    const week = getWeekDayKeys(todayDate);

    expect(week).toEqual([
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ]);
    expect(
      getWeekStrip({ id: "daily", frequency: "daily" }, new Set(["2026-11-23"]), todayDate),
    ).toEqual(["done", "missed", "pending", "future", "future", "future", "future"]);
  });

  it("marks unscheduled weekdays as off rather than missed", () => {
    const todayDate = new Date(2026, 10, 25, 12);

    expect(
      getWeekStrip(
        { id: "selected", frequency: "selected_days", schedule_days: [1, 3] },
        new Set(),
        todayDate,
      ),
    ).toEqual(["missed", "off", "pending", "off", "off", "off", "off"]);
  });
});
