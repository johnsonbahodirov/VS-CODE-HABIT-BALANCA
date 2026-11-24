import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENTS,
  currentStreak,
  detectComeback,
  getLevelProgress,
  getAchievementProgress,
  habitCompletionXp,
  isHabitScheduledOnDay,
  LEVEL_REWARDS,
  LEVEL_XP_THRESHOLDS,
  scheduledStreakStats,
  streakStats,
  xpRewardsForCompletion,
} from "@/lib/gamification";

describe("gamification rules", () => {
  it("counts a current streak from today or gives today a grace day", () => {
    expect(currentStreak(["2026-11-02", "2026-11-03"], "2026-11-03")).toBe(2);
    expect(currentStreak(["2026-11-01", "2026-11-02"], "2026-11-03")).toBe(2);
    expect(currentStreak(["2026-11-01"], "2026-11-03")).toBe(0);
    expect(currentStreak([], "2026-11-03")).toBe(0);
  });

  it("reports current and longest streaks, including missed days", () => {
    expect(
      streakStats(["2026-10-28", "2026-10-29", "2026-11-01", "2026-11-02"], "2026-11-03"),
    ).toEqual({ current: 2, longest: 2 });
  });

  it("does not break a scheduled streak on unscheduled weekdays or weekends", () => {
    expect(
      scheduledStreakStats(["2026-11-05", "2026-11-06", "2026-11-09"], "2026-11-09", {
        frequency: "weekdays",
        schedule_days: [1, 2, 3, 4, 5],
      }),
    ).toEqual({ current: 3, longest: 3 });
  });

  it("handles weekend-only schedules without breaking on intervening weekdays", () => {
    // 2026-11-07 is Sat, 2026-11-08 is Sun, 2026-11-14 is Sat, 2026-11-15 is Sun
    const weekendHabit = {
      frequency: "selected_days",
      schedule_days: [0, 6],
    };
    expect(isHabitScheduledOnDay(weekendHabit, "2026-11-07")).toBe(true);
    expect(isHabitScheduledOnDay(weekendHabit, "2026-11-08")).toBe(true);
    expect(isHabitScheduledOnDay(weekendHabit, "2026-11-09")).toBe(false);

    expect(
      scheduledStreakStats(["2026-11-07", "2026-11-08", "2026-11-14"], "2026-11-14", weekendHabit),
    ).toEqual({ current: 3, longest: 3 });
  });

  it("breaks a scheduled streak when a scheduled day is missed", () => {
    expect(
      scheduledStreakStats(["2026-11-02", "2026-11-06"], "2026-11-06", {
        frequency: "selected_days",
        schedule_days: [1, 3, 5],
      }),
    ).toEqual({ current: 1, longest: 1 });
  });

  it("only counts scheduled days between a habit's start and end dates", () => {
    const habit = {
      frequency: "daily",
      created_at: "2026-11-02T18:00:00.000Z",
      start_date: "2026-11-02",
      end_date: "2026-11-03",
    };
    expect(isHabitScheduledOnDay(habit, "2026-11-01")).toBe(false);
    expect(isHabitScheduledOnDay(habit, "2026-11-02")).toBe(true);
    expect(isHabitScheduledOnDay(habit, "2026-11-03")).toBe(true);
    expect(isHabitScheduledOnDay(habit, "2026-11-04")).toBe(false);
    expect(scheduledStreakStats(["2026-11-02", "2026-11-03"], "2026-11-05", habit)).toEqual({
      current: 2,
      longest: 2,
    });
  });

  it("awards habit completion XP according to difficulty", () => {
    expect(habitCompletionXp("easy")).toBe(5);
    expect(habitCompletionXp("medium")).toBe(10);
    expect(habitCompletionXp("hard")).toBe(15);
  });

  it("defaults unknown or missing difficulty to medium XP", () => {
    expect(habitCompletionXp()).toBe(10);
    expect(habitCompletionXp(null)).toBe(10);
    expect(habitCompletionXp("unknown")).toBe(10);
  });

  it.each([
    [2, 10],
    [3, 40],
    [7, 110],
    [30, 310],
  ])("awards the default 10 XP completion plus the day-%i milestone", (streak, total) => {
    const rewards = xpRewardsForCompletion("habit-a", "2026-11-04", streak);
    expect(rewards.reduce((sum, reward) => sum + reward.amount, 0)).toBe(total);
    expect(rewards[0]).toMatchObject({
      amount: 10,
      idempotencyKey: "completion:habit-a:2026-11-04",
    });
  });

  it("uses the habit difficulty for completion XP and keeps streak bonuses additional", () => {
    expect(xpRewardsForCompletion("habit-a", "2026-11-04", 1, "easy")[0]).toMatchObject({
      amount: 5,
      reason: "Habit completion",
      idempotencyKey: "completion:habit-a:2026-11-04",
    });
    expect(xpRewardsForCompletion("habit-a", "2026-11-04", 1, "medium")[0]?.amount).toBe(10);
    expect(xpRewardsForCompletion("habit-a", "2026-11-04", 1, "hard")[0]?.amount).toBe(15);

    expect(xpRewardsForCompletion("habit-a", "2026-11-04", 3, "hard")).toEqual([
      {
        amount: 15,
        reason: "Habit completion",
        idempotencyKey: "completion:habit-a:2026-11-04",
      },
      {
        amount: 30,
        reason: "3-day habit streak",
        idempotencyKey: "streak:habit-a:3",
      },
    ]);
  });

  it("uses stable idempotency keys across duplicate check-ins and milestone retries", () => {
    const first = xpRewardsForCompletion("habit-a", "2026-11-04", 7);
    const repeatedCompletion = xpRewardsForCompletion("habit-a", "2026-11-04", 7);
    const laterAtSameMilestone = xpRewardsForCompletion("habit-a", "2026-12-01", 7);
    expect(first.map((reward) => reward.idempotencyKey)).toEqual(
      repeatedCompletion.map((reward) => reward.idempotencyKey),
    );
    expect(first[1]?.idempotencyKey).toBe(laterAtSameMilestone[1]?.idempotencyKey);
    expect(first[0]?.idempotencyKey).not.toBe(laterAtSameMilestone[0]?.idempotencyKey);

    const granted = new Set<string>();
    const grantOnce = (rewards: ReturnType<typeof xpRewardsForCompletion>) =>
      rewards.reduce((sum, reward) => {
        if (granted.has(reward.idempotencyKey)) return sum;
        granted.add(reward.idempotencyKey);
        return sum + reward.amount;
      }, 0);
    expect(grantOnce(first)).toBe(110);
    expect(grantOnce(repeatedCompletion)).toBe(0);
    expect(grantOnce(laterAtSameMilestone)).toBe(10);
    expect(granted.size).toBe(3);
  });

  it("uses the eight server-defined level thresholds and caps progress at Legend", () => {
    expect(LEVEL_XP_THRESHOLDS).toEqual([0, 150, 400, 800, 1400, 2300, 3600, 5500]);
    expect(LEVEL_REWARDS.map((reward) => reward.level)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(getLevelProgress(149)).toEqual({
      name: "Beginner",
      level: 1,
      minXp: 0,
      nextLevelXp: 150,
      progressPercent: 99,
    });
    expect(getLevelProgress(399).progressPercent).toBe(99);
    expect(getLevelProgress(400)).toEqual({
      name: "Explorer",
      level: 3,
      minXp: 400,
      nextLevelXp: 800,
      progressPercent: 0,
    });
    expect(getLevelProgress(5499)).toMatchObject({
      name: "Master",
      level: 7,
      minXp: 3600,
      nextLevelXp: 5500,
    });
    expect(getLevelProgress(5500)).toEqual({
      name: "Legend",
      level: 8,
      minXp: 5500,
      nextLevelXp: null,
      progressPercent: 100,
    });
    expect(getLevelProgress(9000)).toEqual(getLevelProgress(5500));
  });

  it("defines the full 32+ achievement catalog across 6 categories", () => {
    expect(ACHIEVEMENT_CATEGORIES).toHaveLength(6);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(32);

    const categories = new Set(ACHIEVEMENT_CATEGORIES.map((category) => category.id));
    for (const item of ACHIEVEMENTS) {
      expect(categories.has(item.category)).toBe(true);
      expect(["common", "rare", "epic", "legendary"]).toContain(item.tier);
      expect(item.target).toBeGreaterThan(0);
      expect(item.rewardXp).toBeGreaterThan(0);
    }
  });

  it("calculates accurate locked progress and percentage for achievements", () => {
    const firstFive = ACHIEVEMENTS.find((achievement) => achievement.key === "first_five")!;
    const progress = getAchievementProgress(firstFive, { habitsCount: 3 }, false);
    expect(progress).toEqual({
      current: 3,
      target: 5,
      percentage: 60,
      isUnlocked: false,
      label: "3 / 5",
    });

    const bookworm = ACHIEVEMENTS.find((achievement) => achievement.key === "bookworm")!;
    const bookwormProgress = getAchievementProgress(bookworm, { readingCompletions: 12 }, false);
    expect(bookwormProgress).toEqual({
      current: 10,
      target: 10,
      percentage: 100,
      isUnlocked: true,
      label: "10 / 10",
    });
  });

  it("detects comeback cycles after 7+ days of inactivity", () => {
    // Normal consecutive activity: no comeback
    const dailyDays = ["2026-11-01", "2026-11-02", "2026-11-03"];
    expect(detectComeback(dailyDays, "2026-11-03").isComeback).toBe(false);

    // Inactive for 10 days before today
    const afterGapDays = ["2026-10-20"];
    const comebackResult = detectComeback(afterGapDays, "2026-11-03", 7);
    expect(comebackResult.isComeback).toBe(true);
    expect(comebackResult.daysInactive).toBe(14);

    // Historical comeback cycle
    const historicalComeback = ["2026-10-01", "2026-10-15", "2026-10-16"];
    const historyResult = detectComeback(historicalComeback, "2026-10-16", 7);
    expect(historyResult.comebackCycles).toBe(1);
  });
});
