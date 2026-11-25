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

  it("allows an optional duration and validates a chosen date range", () => {
    expect(getHabitDurationError("", "2026-11-01", "")).toBeNull();
    expect(getHabitDurationError("", "", "")).toBe("chooseStartDate");
    expect(getHabitDurationError("10", "2026-11-01", "")).toBe("chooseEndDate");
    expect(getHabitDurationError("", "2026-11-02", "2026-11-01")).toBe("invalidEndDate");
    expect(getHabitDurationError("21", "2026-11-01", "2026-11-21")).toBeNull();
  });

  it("rejects fractional and out-of-range durations", () => {
    expect(getHabitDurationError("1.5", "2026-11-01", "")).toBe("invalidDays");
    expect(getHabitDurationError("0", "2026-11-01", "")).toBe("invalidDays");
    expect(getHabitDurationError("3651", "2026-11-01", "")).toBe("invalidDays");
  });
});
