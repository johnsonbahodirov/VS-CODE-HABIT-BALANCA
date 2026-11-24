export type Session = { started_at: string; ended_at: string | null };

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Minutes worked per local day. Running sessions count up to `now`. */
export function minutesByDay(sessions: Session[], now: Date = new Date()): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const start = new Date(s.started_at);
    const end = s.ended_at ? new Date(s.ended_at) : now;
    if (end <= start) continue;
    const cursor = new Date(start);
    while (cursor < end) {
      const nextDay = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1,
        0,
        0,
        0,
      );
      const boundaryTime =
        nextDay.getTime() > cursor.getTime() ? nextDay.getTime() : cursor.getTime() + 86400000;
      const segmentEndMs = Math.min(boundaryTime, end.getTime());
      if (segmentEndMs <= cursor.getTime()) break;
      const k = dayKey(cursor);
      map.set(k, (map.get(k) ?? 0) + (segmentEndMs - cursor.getTime()) / 60000);
      cursor.setTime(segmentEndMs);
    }
  }
  return map;
}

/** Minutes spent per habit (key = habit_id, "none" for untagged). Running sessions count up to `now`. Handles boundary overlaps. */
export function minutesByHabit(
  sessions: (Session & { habit_id?: string | null })[],
  now: Date = new Date(),
  since?: Date,
  until?: Date,
): Map<string, number> {
  const map = new Map<string, number>();
  const effectiveUntil = until ? until.getTime() : now.getTime();
  const effectiveSince = since ? since.getTime() : -Infinity;

  for (const s of sessions) {
    const start = new Date(s.started_at).getTime();
    const rawEnd = s.ended_at ? new Date(s.ended_at).getTime() : now.getTime();
    if (rawEnd <= start) continue;

    // Window intersection
    const segmentStart = Math.max(start, effectiveSince);
    const segmentEnd = Math.min(rawEnd, effectiveUntil);
    if (segmentEnd <= segmentStart) continue;

    const mins = (segmentEnd - segmentStart) / 60000;
    const k = s.habit_id ?? "none";
    map.set(k, (map.get(k) ?? 0) + mins);
  }
  return map;
}

export function minutesByHabitAndDay(
  sessions: (Session & { habit_id?: string | null })[],
  now: Date = new Date(),
): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    const start = new Date(session.started_at);
    const end = session.ended_at ? new Date(session.ended_at) : now;
    if (end <= start) continue;
    const cursor = new Date(start);
    const habitId = session.habit_id ?? "none";
    while (cursor < end) {
      const nextDay = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1,
        0,
        0,
        0,
      );
      const boundaryTime =
        nextDay.getTime() > cursor.getTime() ? nextDay.getTime() : cursor.getTime() + 86400000;
      const segmentEndMs = Math.min(boundaryTime, end.getTime());
      if (segmentEndMs <= cursor.getTime()) break;
      const key = `${habitId}|${dayKey(cursor)}`;
      map.set(key, (map.get(key) ?? 0) + (segmentEndMs - cursor.getTime()) / 60000);
      cursor.setTime(segmentEndMs);
    }
  }
  return map;
}

/** Tracked minutes in local-hour buckets for a selected calendar day. */
export function minutesByHourOnDay(
  sessions: Session[],
  day: string,
  now: Date = new Date(),
): number[] {
  const buckets = Array.from({ length: 24 }, () => 0);
  const dayStart = new Date(`${day}T00:00:00`);
  const dayEnd = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate() + 1,
    0,
    0,
    0,
  );
  for (const session of sessions) {
    const start = new Date(session.started_at);
    const end = session.ended_at ? new Date(session.ended_at) : now;
    if (end <= dayStart || start >= dayEnd || end <= start) continue;
    const cursor = new Date(Math.max(start.getTime(), dayStart.getTime()));
    const clippedEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()));
    while (cursor < clippedEnd) {
      const nextHour = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        cursor.getHours() + 1,
        0,
        0,
        0,
      );
      const boundaryTime =
        nextHour.getTime() > cursor.getTime() ? nextHour.getTime() : cursor.getTime() + 3600000;
      const segmentEndMs = Math.min(boundaryTime, clippedEnd.getTime());
      if (segmentEndMs <= cursor.getTime()) break;
      const hour = cursor.getHours();
      if (hour >= 0 && hour < 24) {
        buckets[hour] = (buckets[hour] ?? 0) + (segmentEndMs - cursor.getTime()) / 60000;
      }
      cursor.setTime(segmentEndMs);
    }
  }
  return buckets;
}

/**
 * Overall balance in minutes: for every day you worked, worked − daily target.
 * Days with no work are rest days and do not count against you.
 */
export function totalBalance(
  sessions: Session[],
  targetMinutes: number,
  now: Date = new Date(),
): number {
  let total = 0;
  for (const mins of minutesByDay(sessions, now).values()) total += mins - targetMinutes;
  return Math.round(total);
}

export function formatMinutes(mins: number, signed = false): string {
  const sign = mins < 0 ? "−" : signed ? "+" : "";
  const a = Math.abs(Math.round(mins));
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `${sign}${h}h ${String(m).padStart(2, "0")}m`;
}
