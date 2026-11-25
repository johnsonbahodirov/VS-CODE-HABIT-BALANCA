import { describe, expect, it } from "vitest";
import {
  getHabitDurationError,
  habitEndDateAfterDays,
  inclusiveHabitDurationDays,
} from "@/lib/habit-duration";

describe("habit duration choices", () => {
  it("calculates preset dates inclusively", () => {
    const endDate = habitEndDateAfterDays("2026-11-01", 21);
    expect(endDate).toBe("2026-11-21");
    expect(inclusiveHabitDurationDays("2026-11-01", endDate)).toBe(21);
  });

  it("requires a duration and a valid date range", () => {
    expect(getHabitDurationError("", "2026-11-01", "")).toBe("chooseDuration");
    expect(getHabitDurationError("custom", "", "")).toBe("chooseStartDate");
    expect(getHabitDurationError("custom", "2026-11-01", "")).toBe("chooseEndDate");
    expect(getHabitDurationError("custom", "2026-11-02", "2026-11-01")).toBe("invalidEndDate");
    expect(getHabitDurationError("21", "2026-11-01", "2026-11-21")).toBeNull();
  });
});
