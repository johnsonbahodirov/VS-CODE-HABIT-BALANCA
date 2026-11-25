import { describe, expect, it } from "vitest";
import { getCustomElapsedDays, getStatsPeriod } from "@/lib/stats-periods";

describe("Stats period ranges", () => {
  it("keeps future days in the chart range and compares equal elapsed date counts", () => {
    const period = getStatsPeriod("2026-11-25", "week", "2026-11-27");

    expect(period.fullDays).toHaveLength(7);
    expect(period.fullDays[0]).toBe("2026-11-23");
    expect(period.fullDays[6]).toBe("2026-11-29");
    expect(period.elapsedDays).toEqual([
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
    ]);
    expect(period.previousDays).toEqual([
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });

  it("uses trailing calendar months and clamps custom comparisons to today", () => {
    const period = getStatsPeriod("2026-11-15", "3months", "2026-11-15");

    expect(period.startDay).toBe("2026-09-01");
    expect(period.endDay).toBe("2026-11-30");
    expect(period.elapsedDays).toHaveLength(76);
    expect(getCustomElapsedDays("2026-11-10", "2026-11-20", "2026-11-15")).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(getCustomElapsedDays("2020-01-01", "2026-11-15", "2026-11-15", 3)).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });
});
