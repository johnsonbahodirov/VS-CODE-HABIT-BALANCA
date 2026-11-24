import { describe, it, expect, vi } from "vitest";
import { csvCell, downloadTextFile, habitLogsToCsv, sessionsToCsv } from "@/lib/export";
import { HABIT_COLORS, HABIT_COLOR_VALUES, colorBg } from "@/lib/data";

describe("csv export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("neutralizes spreadsheet formulas but keeps negative numbers", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvCell("-5")).toBe("-5");
  });

  it("exports habit logs sorted by day with habit names", () => {
    const csv = habitLogsToCsv(
      [{ id: "h1", name: "Read", category: "Learning" }],
      [
        { habit_id: "h1", day: "2026-11-02", count: 1 },
        { habit_id: "h1", day: "2026-11-01", count: 1 },
      ],
    );
    expect(csv.split("\n")).toEqual([
      "date,habit,category,count",
      "2026-11-01,Read,Learning,1",
      "2026-11-02,Read,Learning,1",
    ]);
  });

  it("exports session minutes and leaves running sessions open", () => {
    const csv = sessionsToCsv(
      [{ id: "h1", name: "Read" }],
      [
        { habit_id: "h1", started_at: "2026-11-01T10:00:00Z", ended_at: "2026-11-01T10:25:00Z" },
        { habit_id: null, started_at: "2026-11-01T12:00:00Z", ended_at: null },
      ],
    );
    const lines = csv.split("\n");
    expect(lines[1]).toBe("2026-11-01T10:00:00Z,2026-11-01T10:25:00Z,25,Read");
    expect(lines[2]).toBe("2026-11-01T12:00:00Z,,,");
  });

  it("downloadTextFile creates blob, appends link, clicks, and schedules cleanup", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/test-uuid");
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        el.click = clickSpy;
      }
      return el;
    });

    downloadTextFile("test.csv", "a,b,c");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // Revoke should NOT happen immediately
    expect(revokeObjectURL).not.toHaveBeenCalled();

    // After timer runs, revokeObjectURL is invoked
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/test-uuid");

    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});

describe("habit colors", () => {
  it("offers the exact palette and every offered color has a style", () => {
    expect(HABIT_COLORS).toEqual([
      "#219B70",
      "#4779C7",
      "#8760C5",
      "#E05275",
      "#E5A323",
      "#269E9A",
      "#E56B45",
      "#5556A8",
      "#D94C9A",
      "#319CC4",
      "#16865F",
      "#7046AD",
    ]);
    for (const color of HABIT_COLORS) {
      expect(colorBg[color]).toBeTruthy();
      expect(HABIT_COLOR_VALUES[color]).toBeTruthy();
    }
  });

  it("still renders legacy colors on old habits", () => {
    expect(colorBg["zinc"]).toBeTruthy();
    expect(HABIT_COLOR_VALUES["stone"]).toBeTruthy();
  });
});
