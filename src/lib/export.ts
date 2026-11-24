export type ExportHabit = { id: string; name: string; category?: string | null };
export type ExportLog = { habit_id: string; day: string; count: number };
export type ExportSession = {
  habit_id?: string | null;
  started_at: string;
  ended_at: string | null;
};

/** Quotes a CSV cell and neutralizes spreadsheet formulas (=, +, -, @). */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function habitLogsToCsv(habits: ExportHabit[], logs: ExportLog[]): string {
  const byId = new Map(habits.map((habit) => [habit.id, habit]));
  const rows = logs
    .slice()
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((log) => {
      const habit = byId.get(log.habit_id);
      return [log.day, habit?.name ?? "Unknown habit", habit?.category ?? "", log.count];
    });
  return toCsv([["date", "habit", "category", "count"], ...rows]);
}

export function sessionsToCsv(habits: ExportHabit[], sessions: ExportSession[]): string {
  const byId = new Map(habits.map((habit) => [habit.id, habit.name]));
  const rows = sessions.map((session) => {
    const end = session.ended_at ? new Date(session.ended_at) : null;
    const minutes = end
      ? Math.max(0, Math.round((end.getTime() - new Date(session.started_at).getTime()) / 60000))
      : "";
    return [
      session.started_at,
      session.ended_at ?? "",
      minutes,
      session.habit_id ? (byId.get(session.habit_id) ?? "") : "",
    ];
  });
  return toCsv([["started_at", "ended_at", "minutes", "habit"], ...rows]);
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }, 1000);
}
