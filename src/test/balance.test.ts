import { describe, it, expect } from "vitest";
import {
  totalBalance,
  formatMinutes,
  minutesByHabit,
  minutesByDay,
  minutesByHourOnDay,
} from "@/lib/balance";

const s = (start: string, end: string | null) => ({ started_at: start, ended_at: end });

describe("time balance", () => {
  it("adds overtime when working more than the daily target", () => {
    expect(totalBalance([s("2026-11-02T09:00:00", "2026-11-02T18:00:00")], 480)).toBe(60);
  });
  it("subtracts when working less than the target", () => {
    expect(totalBalance([s("2026-11-02T09:00:00", "2026-11-02T15:00:00")], 480)).toBe(-120);
  });
  it("rest days with no work do not count", () => {
    const sessions = [
      s("2026-11-02T09:00:00", "2026-11-02T17:00:00"),
      s("2026-11-04T09:00:00", "2026-11-04T17:30:00"),
    ];
    expect(totalBalance(sessions, 480)).toBe(30);
  });
  it("running session counts up to now", () => {
    const now = new Date("2026-11-02T10:00:00");
    expect(totalBalance([s("2026-11-02T09:00:00", null)], 480, now)).toBe(-420);
  });
  it("sums time per habit", () => {
    const m = minutesByHabit([
      { ...s("2026-11-02T09:00:00", "2026-11-02T10:00:00"), habit_id: "a" },
      { ...s("2026-11-03T09:00:00", "2026-11-03T09:30:00"), habit_id: "a" },
      { ...s("2026-11-03T11:00:00", "2026-11-03T11:15:00"), habit_id: "b" },
    ]);
    expect(m.get("a")).toBe(90);
    expect(m.get("b")).toBe(15);
  });
  it("splits sessions that cross local midnight across both calendar days", () => {
    const daily = minutesByDay([s("2026-11-02T23:30:00", "2026-11-03T01:00:00")]);
    expect(daily.get("2026-11-02")).toBe(30);
    expect(daily.get("2026-11-03")).toBe(60);
  });
  it("aggregates a selected day's sessions into local hourly buckets", () => {
    const hourly = minutesByHourOnDay(
      [
        s("2026-11-02T09:30:00", "2026-11-02T11:00:00"),
        s("2026-11-02T10:15:00", "2026-11-02T10:45:00"),
      ],
      "2026-11-02",
    );
    expect(hourly).toHaveLength(24);
    expect(hourly[9]).toBe(30);
    expect(hourly[10]).toBe(90);
    expect(hourly[11]).toBe(0);
  });
  it("formats signed values", () => {
    expect(formatMinutes(90, true)).toBe("+1h 30m");
    expect(formatMinutes(-45)).toBe("−0h 45m");
  });
  it("minutesByHabit correctly includes sessions overlapping the since boundary", () => {
    const since = new Date("2026-11-03T00:00:00");
    const sessions = [
      // Starts before since (23:30) and ends after since (01:00) -> 60 minutes after midnight
      { ...s("2026-11-02T23:30:00", "2026-11-03T01:00:00"), habit_id: "habit-1" },
      // Completely before since -> 0 minutes
      { ...s("2026-11-02T10:00:00", "2026-11-02T11:00:00"), habit_id: "habit-1" },
      // Completely inside since -> 45 minutes
      { ...s("2026-11-03T02:00:00", "2026-11-03T02:45:00"), habit_id: "habit-1" },
    ];
    const map = minutesByHabit(sessions, new Date("2026-11-03T12:00:00"), since);
    expect(map.get("habit-1")).toBe(105); // 60 + 45
  });
  it("minutesByHabit clips sessions to until boundary", () => {
    const since = new Date("2026-11-03T00:00:00");
    const until = new Date("2026-11-03T01:00:00");
    const sessions = [
      // 23:30 to 01:30 clipped to [00:00, 01:00] -> 60 minutes
      { ...s("2026-11-02T23:30:00", "2026-11-03T01:30:00"), habit_id: "h" },
    ];
    const map = minutesByHabit(sessions, new Date("2026-11-03T12:00:00"), since, until);
    expect(map.get("h")).toBe(60);
  });
});
