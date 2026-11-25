import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  Clock3,
  Flame,
  NotebookPen,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDayNotes,
  useHabitLogs,
  useHabitNotes,
  useHabits,
  useSaveDayNote,
  useSaveHabitNote,
  useSaveTarget,
  useXPTransactionsBetween,
  useSessions,
  useSettings,
} from "@/lib/data";
import {
  dayKey,
  formatMinutes,
  minutesByDay,
  minutesByHabitAndDay,
  minutesByHourOnDay,
} from "@/lib/balance";
import { cn } from "@/lib/utils";
import { HabitBadge } from "@/components/app-widgets";
import { DatabaseErrorNotice } from "@/components/database-error-notice";
import { isHabitScheduledOnDay, scheduledStreakStats } from "@/lib/gamification";
import { HABIT_COLORS, HABIT_COLOR_VALUES } from "@/lib/data";
import { calculateWeeklyInsights } from "@/lib/stats-insights";
import { COPY } from "@/lib/strings";

const StatsChart = lazy(() => import("@/components/stats-chart"));
const StatsBreakdownChart = lazy(() => import("@/components/stats-breakdown-chart"));

type Range = "day" | "week" | "month" | "3months" | "6months" | "year";
type StatsView = "trend" | "breakdown";

const EMPTY_ARRAY: never[] = [];
const ALL_HABITS = "all";

const rangeOptions: { key: Range; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "3months", label: "3 mo" },
  { key: "6months", label: "6 mo" },
  { key: "year", label: "Year" },
];

function shiftDate(date: Date, range: Range, direction: number): Date {
  const next = new Date(date);
  if (range === "day") next.setDate(next.getDate() + direction);
  else if (range === "week") next.setDate(next.getDate() + direction * 7);
  else if (range === "month") next.setMonth(next.getMonth() + direction);
  else if (range === "3months") next.setMonth(next.getMonth() + direction * 3);
  else if (range === "6months") next.setMonth(next.getMonth() + direction * 6);
  else next.setFullYear(next.getFullYear() + direction);
  return next;
}

function periodStart(date: Date, range: Range): Date {
  if (range === "day") return date;
  if (range === "week") return startOfWeek(date, { weekStartsOn: 1 });
  if (range === "month") return startOfMonth(date);
  const start = new Date(date);
  start.setMonth(start.getMonth() - (range === "3months" ? 2 : range === "6months" ? 5 : 11));
  return startOfMonth(start);
}

function periodEnd(date: Date, range: Range): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  if (range === "day") return end;
  if (range === "week") {
    const last = startOfWeek(date, { weekStartsOn: 1 });
    last.setDate(last.getDate() + 6);
    last.setHours(23, 59, 59, 999);
    return last;
  }
  if (range === "month") {
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    last.setHours(23, 59, 59, 999);
    return last;
  }
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  last.setHours(23, 59, 59, 999);
  return last;
}

function dateList(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0);
  const last = new Date(end);
  last.setHours(12, 0, 0, 0);
  for (; cursor <= last; cursor.setDate(cursor.getDate() + 1)) days.push(new Date(cursor));
  return days;
}

function consistencyWeeks(today: Date): Date[][] {
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - 363);
  const days = dateList(
    startOfWeek(firstDay, { weekStartsOn: 1 }),
    endOfWeek(today, { weekStartsOn: 1 }),
  );
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({ meta: [{ title: "Stats — Balance" }] }),
  component: Stats,
});

function Stats() {
  const [range, setRange] = useState<Range>("week");
  const [statsView, setStatsView] = useState<StatsView>("trend");
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));
  const [selectedHabitId, setSelectedHabitId] = useState(ALL_HABITS);
  const selectedDate = new Date(`${selectedDay}T12:00:00`);
  const today = dayKey(new Date());
  const habitsQuery = useHabits();
  const logsQuery = useHabitLogs();
  const notesQuery = useHabitNotes();
  const dayNotesQuery = useDayNotes();
  const sessionsQuery = useSessions();
  const settingsQuery = useSettings();
  const habits = useMemo(
    () =>
      (habitsQuery.data ?? EMPTY_ARRAY).map((habit) => ({
        ...habit,
        name: habit.name ?? "Unnamed habit",
        category: habit.category ?? "Uncategorized",
        color: habit.color ?? "#219B70",
        frequency: habit.frequency ?? "daily",
        schedule_days: habit.schedule_days ?? [],
        skipped_dates: habit.skipped_dates ?? [],
      })),
    [habitsQuery.data],
  );
  const logs = logsQuery.data ?? EMPTY_ARRAY;
  const notes = notesQuery.data ?? EMPTY_ARRAY;
  const dayNotes = dayNotesQuery.data ?? EMPTY_ARRAY;
  const sessions = useMemo(
    () =>
      (sessionsQuery.data ?? EMPTY_ARRAY)
        .filter(
          (session) =>
            typeof session.started_at === "string" &&
            Number.isFinite(Date.parse(session.started_at)) &&
            (session.ended_at == null ||
              (typeof session.ended_at === "string" &&
                Number.isFinite(Date.parse(session.ended_at)))),
        )
        .map((session) => ({ ...session, mode: session.mode ?? "stopwatch" })),
    [sessionsQuery.data],
  );
  const settings = settingsQuery.data;
  const saveNote = useSaveHabitNote();
  const saveGoal = useSaveTarget();

  const start = periodStart(selectedDate, range);
  const periodLastDay = periodEnd(selectedDate, range);
  const todayDate = new Date(`${today}T12:00:00`);
  const end = periodLastDay > todayDate ? todayDate : periodLastDay;
  const days = dateList(start, end);
  const weeklyStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = new Date(weeklyStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const xpHistoryQuery = useXPTransactionsBetween(dayKey(weeklyStart), dayKey(weekEnd));
  const xpHistory = xpHistoryQuery.data ?? EMPTY_ARRAY;
  const completedLogs = useMemo(
    () =>
      logs.filter((log) => {
        const habit = habits.find((item) => item.id === log.habit_id);
        return (
          habit?.tracking_type !== "count" || (log.count ?? 0) >= (habit.daily_goal_count ?? 1)
        );
      }),
    [logs, habits],
  );
  const completions = useMemo(
    () => new Set(completedLogs.map((log) => `${log.habit_id}|${log.day}`)),
    [completedLogs],
  );
  const timeByDay = useMemo(() => minutesByDay(sessions), [sessions]);
  const timeByHabitDay = useMemo(() => minutesByHabitAndDay(sessions), [sessions]);
  const logCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of completedLogs) counts.set(log.day, (counts.get(log.day) ?? 0) + 1);
    return counts;
  }, [completedLogs]);
  const dailyGoal = settings?.daily_goal_minutes ?? 120;
  const totalMinutes = days.reduce((sum, day) => sum + (timeByDay.get(dayKey(day)) ?? 0), 0);
  const totalDone = days.reduce((sum, day) => sum + (logCounts.get(dayKey(day)) ?? 0), 0);
  const possible = days.reduce(
    (sum, day) =>
      sum +
      habits.filter(
        (habit) =>
          isHabitScheduledOnDay(habit, dayKey(day)) &&
          !(habit.skipped_dates ?? []).includes(dayKey(day)),
      ).length,
    0,
  );
  const completionRate = possible ? Math.round((totalDone / possible) * 100) : 0;
  const priorWeekStart = new Date(weeklyStart);
  priorWeekStart.setDate(priorWeekStart.getDate() - 7);
  const totalForWeek = (weekStart: Date) =>
    Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      return timeByDay.get(dayKey(date)) ?? 0;
    }).reduce((sum, minutes) => sum + minutes, 0);
  const currentWeekMinutes = totalForWeek(weeklyStart);
  const previousWeekMinutes = totalForWeek(priorWeekStart);
  const weeklyGrowth =
    previousWeekMinutes > 0
      ? Math.round(((currentWeekMinutes - previousWeekMinutes) / previousWeekMinutes) * 100)
      : null;
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weeklyStart);
    date.setDate(date.getDate() + index);
    return date;
  });
  const previousWeekDates = weekDates.map((date) => {
    const previous = new Date(date);
    previous.setDate(previous.getDate() - 7);
    return previous;
  });
  const weeklyInsights = calculateWeeklyInsights(
    habits,
    completions,
    weekDates.map(dayKey),
    previousWeekDates.map(dayKey),
    today,
  );
  const bestHabitThisWeek = habits
    .map((habit) => {
      const scheduledDays = weekDates.filter(
        (date) =>
          dayKey(date) <= today &&
          isHabitScheduledOnDay(habit, dayKey(date)) &&
          !(habit.skipped_dates ?? []).includes(dayKey(date)),
      );
      const completedDays = scheduledDays.filter((date) =>
        completions.has(`${habit.id}|${dayKey(date)}`),
      ).length;
      return { habit, completedDays, scheduledDays: scheduledDays.length };
    })
    .sort((left, right) => right.completedDays - left.completedDays)[0];
  const bestDay = days.reduce<{ date: Date | null; minutes: number }>(
    (best, day) => {
      const minutes = timeByDay.get(dayKey(day)) ?? 0;
      return minutes > best.minutes ? { date: day, minutes } : best;
    },
    { date: null, minutes: 0 },
  );
  const weekXp = xpHistory
    .filter((transaction) => transaction.day)
    .filter(
      (transaction) =>
        transaction.day! >= dayKey(weeklyStart) && transaction.day! <= dayKey(weekEnd),
    )
    .reduce((sum, transaction) => sum + (transaction.amount ?? 0), 0);
  const chartData =
    range === "day"
      ? minutesByHourOnDay(sessions, selectedDay).map((minutes, hour) => ({
          date: `${selectedDay}T${String(hour).padStart(2, "0")}:00`,
          label: `${String(hour).padStart(2, "0")}:00`,
          minutes: Math.round(minutes),
          completed: 0,
        }))
      : (range === "week" || range === "month" ? dateList(start, periodLastDay) : days).map(
          (day) => ({
            date: dayKey(day),
            label: format(day, range === "year" ? "MMM" : "MMM d"),
            minutes: Math.round(timeByDay.get(dayKey(day)) ?? 0),
            completed: logCounts.get(dayKey(day)) ?? 0,
          }),
        );
  const breakdownData = useMemo(() => {
    const categories = new Map<string, number>();
    for (const habit of habits) {
      const minutes = days.reduce(
        (sum, day) => sum + (timeByHabitDay.get(`${habit.id}|${dayKey(day)}`) ?? 0),
        0,
      );
      if (minutes > 0)
        categories.set(habit.category, (categories.get(habit.category) ?? 0) + minutes);
    }
    const unassignedMinutes = days.reduce(
      (sum, day) => sum + (timeByHabitDay.get(`none|${dayKey(day)}`) ?? 0),
      0,
    );
    if (unassignedMinutes > 0) categories.set("Unassigned", unassignedMinutes);
    return [...categories.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([name, minutes], index) => ({
        name,
        minutes,
        color:
          name === "Unassigned"
            ? "var(--muted-foreground)"
            : (HABIT_COLOR_VALUES[HABIT_COLORS[index % HABIT_COLORS.length]!] ?? "#4ade80"),
      }));
  }, [habits, days, timeByHabitDay]);
  const noteByHabit = new Map(
    notes.filter((note) => note.day === selectedDay).map((note) => [note.habit_id, note.note]),
  );
  const dayNote = dayNotes.find((note) => note.day === selectedDay)?.note ?? "";
  const selectedHabit = habits.find((habit) => habit.id === selectedHabitId);
  const activeHabitId = selectedHabit ? selectedHabitId : ALL_HABITS;
  const selectedHabitLogs =
    activeHabitId === ALL_HABITS
      ? completedLogs
      : completedLogs.filter((log) => log.habit_id === activeHabitId);
  const selectedLogDays = selectedHabitLogs.map((log) => log.day);
  const selectedStreak =
    selectedHabit && selectedHabitId !== ALL_HABITS
      ? scheduledStreakStats(selectedLogDays, today, selectedHabit)
      : null;
  const calendarWeeks = useMemo(() => consistencyWeeks(new Date(`${today}T12:00:00`)), [today]);
  const last30Start = new Date(`${today}T12:00:00`);
  last30Start.setDate(last30Start.getDate() - 29);
  const last30StartKey = dayKey(last30Start);
  const activeDaysLast30 = new Set(
    selectedHabitLogs
      .filter((log) => log.day >= last30StartKey && log.day <= today)
      .map((log) => log.day),
  ).size;
  const focusedMinutes = [...timeByHabitDay.entries()]
    .filter(([key]) =>
      selectedHabitId === ALL_HABITS ? true : key.startsWith(`${activeHabitId}|`),
    )
    .reduce((sum, [, minutes]) => sum + minutes, 0);
  const selectedDayCompletions = habits.filter((habit) => {
    return (
      (activeHabitId === ALL_HABITS || habit.id === activeHabitId) &&
      completions.has(`${habit.id}|${selectedDay}`)
    );
  });
  const selectedDayStart = new Date(`${selectedDay}T00:00:00`);
  const selectedDayEnd = new Date(
    selectedDayStart.getFullYear(),
    selectedDayStart.getMonth(),
    selectedDayStart.getDate() + 1,
  );
  const selectedDaySessions = sessions
    .filter((session) => {
      const sessionStart = new Date(session.started_at);
      const sessionEnd = session.ended_at ? new Date(session.ended_at) : new Date();
      return sessionStart < selectedDayEnd && sessionEnd > selectedDayStart;
    })
    .map((session) => {
      const sessionStart = new Date(session.started_at);
      const sessionEnd = session.ended_at ? new Date(session.ended_at) : new Date();
      const minutes =
        Math.max(
          0,
          Math.min(sessionEnd.getTime(), selectedDayEnd.getTime()) -
            Math.max(sessionStart.getTime(), selectedDayStart.getTime()),
        ) / 60000;
      return { session, minutes };
    });
  const selectedDayMinutesByMode = selectedDaySessions.reduce(
    (totals, { session, minutes }) => {
      const mode = session.mode === "pomodoro" ? "pomodoro" : "stopwatch";
      totals[mode] += minutes;
      return totals;
    },
    { pomodoro: 0, stopwatch: 0 },
  );
  const motivation = selectedHabit
    ? selectedStreak && selectedStreak.current > 0
      ? `You're building momentum with a ${selectedStreak.current}-day streak. Keep showing up for ${selectedHabit.name} — small steps are adding up.`
      : activeDaysLast30 > 0
        ? `You've checked in ${activeDaysLast30} ${activeDaysLast30 === 1 ? "day" : "days"} this month. Every return counts; one small step today can restart your rhythm.`
        : selectedHabitLogs.length > 0
          ? `You've completed ${selectedHabitLogs.length} ${selectedHabitLogs.length === 1 ? "time" : "times"} so far. A missed day doesn't erase that progress — your next check-in is a fresh start.`
          : "Your first check-in is still ahead. Start small whenever you're ready — building a routine begins with one step."
    : "Every check-in is progress. Keep building a routine that works for you, one day at a time.";
  const dataQueries = [
    habitsQuery,
    logsQuery,
    notesQuery,
    dayNotesQuery,
    sessionsQuery,
    settingsQuery,
    xpHistoryQuery,
  ];
  const hasDataError = dataQueries.some((query) => query.isError);

  const chooseDay = (value: string) => {
    if (value) setSelectedDay(value > today ? today : value);
  };
  const shiftSelectedDate = (direction: number) => {
    chooseDay(dayKey(shiftDate(selectedDate, range, direction)));
  };
  if (hasDataError) {
    return (
      <DatabaseErrorNotice
        title="Statistics could not be loaded"
        error={dataQueries.find((query) => query.isError)?.error}
        onRetry={() => {
          void Promise.all(dataQueries.map((query) => query.refetch()));
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Your effort, made visible</p>
          <h1 className="text-3xl font-bold tracking-tight">Statistics</h1>
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-2xl border bg-surface px-3 py-2 text-sm shadow-sm">
          <CalendarDays className="size-4 text-primary" />
          <span className="sr-only">Select a date</span>
          <input
            type="date"
            value={selectedDay}
            max={today}
            onChange={(event) => chooseDay(event.target.value)}
            className="bg-transparent outline-none"
          />
        </label>
      </header>

      <section className="rounded-3xl border border-primary/10 bg-surface p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap rounded-2xl bg-cell/80 p-1">
            {rangeOptions.map((option) => (
              <button
                type="button"
                key={option.key}
                onClick={() => setRange(option.key)}
                className={cn(
                  "rounded-xl px-3 py-2 text-xs font-semibold transition-colors sm:text-sm",
                  range === option.key
                    ? "bg-surface text-primary shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-2xl border bg-background/70 p-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous period"
              onClick={() => shiftSelectedDate(-1)}
            >
              <ArrowLeft />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">
              {range === "day"
                ? format(selectedDate, "MMM d, yyyy")
                : `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next period"
              disabled={selectedDay >= today}
              onClick={() => shiftSelectedDate(1)}
            >
              <ArrowRight />
            </Button>
          </div>
        </div>

        <div
          role="group"
          aria-label="Statistics visualization"
          className="mt-4 inline-flex rounded-xl bg-cell/80 p-1"
        >
          {(
            [
              ["trend", "Trend"],
              ["breakdown", "Breakdown"],
            ] as const
          ).map(([view, label]) => (
            <button
              type="button"
              key={view}
              aria-pressed={statsView === view}
              onClick={() => setStatsView(view)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                statsView === view ? "bg-surface text-primary shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile icon={<Clock3 />} label="Focused" value={formatMinutes(totalMinutes)} />
          <StatTile icon={<Target />} label="Completions" value={String(totalDone)} />
          <StatTile icon={<Flame />} label="Consistency" value={`${completionRate}%`} />
        </div>

        <div className="mt-6 h-60 w-full rounded-2xl bg-background/50 px-1 pt-3 sm:h-72 sm:px-3">
          <Suspense fallback={<div className="h-full animate-pulse rounded-2xl bg-cell" />}>
            {statsView === "trend" ? (
              <StatsChart data={chartData} />
            ) : (
              <StatsBreakdownChart data={breakdownData} />
            )}
          </Suspense>
        </div>
        {statsView === "breakdown" && breakdownData.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {breakdownData.map((item) => {
              const total = breakdownData.reduce((sum, entry) => sum + entry.minutes, 0);
              return (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-3 rounded-xl bg-cell/60 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatMinutes(item.minutes)} ·{" "}
                    {total ? Math.round((item.minutes / total) * 100) : 0}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {range === "week" && (
        <section className="rounded-3xl border border-primary/10 bg-surface p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Weekly recap</h2>
              <p className="text-sm text-muted-foreground">
                {format(weeklyStart, "MMM d")} – {format(weekEnd, "MMM d")}
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-2xl bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            This week: {formatMinutes(currentWeekMinutes)} / Last week:{" "}
            {formatMinutes(previousWeekMinutes)} / Improvement:{" "}
            <span
              className={cn(
                "font-semibold",
                weeklyGrowth === null
                  ? "text-primary"
                  : weeklyGrowth >= 0
                    ? "text-primary"
                    : "text-destructive",
              )}
            >
              {weeklyGrowth === null ? "New" : `${weeklyGrowth > 0 ? "+" : ""}${weeklyGrowth}%`}
            </span>
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InsightTile label="Habit completions" value={String(totalDone)} icon={<Check />} />
            <InsightTile
              label="Focus time"
              value={formatMinutes(currentWeekMinutes)}
              icon={<Clock3 />}
            />
            <InsightTile
              label="Best day"
              value={
                bestDay.date
                  ? `${format(bestDay.date, "EEE")} · ${formatMinutes(bestDay.minutes)}`
                  : "No focus time"
              }
              icon={<Flame />}
            />
            <InsightTile label="XP earned" value={`+${weekXp} XP`} icon={<Award />} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <InsightTile
              label={COPY.stats.weeklyCompletion}
              value={COPY.stats.weekComparison(
                weeklyInsights.completionRate,
                weeklyInsights.previousCompletionRate,
                weeklyInsights.completionRateChange,
              )}
              icon={<Check />}
            />
            <InsightTile
              label={COPY.stats.bestWeekday}
              value={
                weeklyInsights.bestWeekday
                  ? `${COPY.stats.weekdays[weeklyInsights.bestWeekday.weekdayIndex]} · ${weeklyInsights.bestWeekday.completionRate}%`
                  : COPY.stats.noScheduledData
              }
              icon={<Flame />}
            />
            <InsightTile
              label={COPY.stats.mostMissed}
              value={
                weeklyInsights.mostMissedHabit
                  ? `${weeklyInsights.mostMissedHabit.name} · ${COPY.stats.missedCount(weeklyInsights.mostMissedHabit.missed)}`
                  : COPY.stats.noMissedHabits
              }
              icon={<Target />}
            />
          </div>
          <div className="mt-4 rounded-2xl border border-primary/10 bg-background/60 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Your best habit this week</p>
            {bestHabitThisWeek && bestHabitThisWeek.completedDays > 0 ? (
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{bestHabitThisWeek.habit.name}</p>
                <p className="text-sm text-muted-foreground">
                  {bestHabitThisWeek.completedDays} of {bestHabitThisWeek.scheduledDays} days
                  completed ·{" "}
                  {Math.round(
                    (bestHabitThisWeek.completedDays / bestHabitThisWeek.scheduledDays) * 100,
                  )}
                  %
                </p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No completed habits yet.</p>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {COPY.stats.week(completionRate)}. Small, repeated actions build lasting progress.
          </p>
        </section>
      )}

      {range === "month" && (
        <section className="rounded-3xl border border-primary/10 bg-surface p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="font-semibold">Monthly report</h2>
            <p className="text-sm text-muted-foreground">{format(start, "MMMM yyyy")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InsightTile label="Focus time" value={formatMinutes(totalMinutes)} icon={<Clock3 />} />
            <InsightTile label="Habit completions" value={String(totalDone)} icon={<Check />} />
            <InsightTile label="Success rate" value={`${completionRate}%`} icon={<Target />} />
            <InsightTile
              label="Best day"
              value={
                bestDay.date
                  ? `${format(bestDay.date, "EEE, MMM d")} · ${formatMinutes(bestDay.minutes)}`
                  : "No focus time"
              }
              icon={<Flame />}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Based on {days.length} elapsed days and {possible} scheduled habit check-ins.
          </p>
        </section>
      )}

      <section className="rounded-3xl border border-primary/10 bg-surface p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Habit progress</h2>
            <p className="text-sm text-muted-foreground">
              Completion and focused time for this period
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Daily goal
            <Input
              type="number"
              min={15}
              max={1440}
              className="h-9 w-20"
              value={dailyGoal}
              onChange={(event) => {
                const minutes = Number(event.target.value);
                if (minutes >= 15 && minutes <= 1440) saveGoal.mutate(minutes);
              }}
            />
            min
          </label>
        </div>
        {habits.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {habits.map((habit) => {
              const completed = days.filter((day) =>
                completions.has(`${habit.id}|${dayKey(day)}`),
              ).length;
              const scheduledDays = days.filter((day) =>
                isHabitScheduledOnDay(habit, dayKey(day)),
              ).length;
              const rate = scheduledDays ? Math.round((completed / scheduledDays) * 100) : 0;
              const minutes = days.reduce(
                (sum, day) => sum + (timeByHabitDay.get(`${habit.id}|${dayKey(day)}`) ?? 0),
                0,
              );
              return (
                <button
                  key={habit.id}
                  type="button"
                  aria-pressed={selectedHabitId === habit.id}
                  onClick={() => setSelectedHabitId(habit.id)}
                  className={cn(
                    "w-full rounded-2xl border border-transparent bg-cell/70 p-3 text-left transition-colors hover:border-primary/40",
                    selectedHabitId === habit.id && "border-primary/50 bg-primary/5",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <HabitBadge icon={habit.icon} color={habit.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap justify-between gap-1">
                        <p className="font-semibold">{habit.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {completed}/{scheduledDays} days · {formatMinutes(minutes)}
                        </p>
                      </div>
                      <Progress value={rate} className="mt-2 h-2" />
                    </div>
                    <span className="w-10 text-right text-sm font-semibold text-primary">
                      {rate}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Add a habit to see its progress here.</p>
        )}
      </section>

      <section className="rounded-3xl border border-primary/10 bg-surface p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Consistency calendar</h2>
            <p className="text-sm text-muted-foreground">
              Choose a habit to explore its progress, or view your full routine.
            </p>
          </div>
          <Select value={activeHabitId} onValueChange={setSelectedHabitId}>
            <SelectTrigger
              className="w-full bg-background sm:w-56"
              aria-label="Filter calendar by habit"
            >
              <SelectValue placeholder="Choose a habit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_HABITS}>All habits</SelectItem>
              {habits.map((habit) => (
                <SelectItem key={habit.id} value={habit.id}>
                  {habit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedHabit ? (
          <div className="mb-5 rounded-2xl border bg-cell/50 p-4">
            <div className="flex items-start gap-3">
              <HabitBadge icon={selectedHabit.icon} color={selectedHabit.color} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{selectedHabit.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedHabit.category} · Started{" "}
                  {format(new Date(selectedHabit.created_at), "MMM d, yyyy")}
                </p>
              </div>
              <div className="hidden max-w-sm items-start gap-2 rounded-xl bg-background/70 p-3 text-xs leading-relaxed text-muted-foreground sm:flex">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{motivation}</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <InsightTile
                label="Total check-ins"
                value={String(selectedHabitLogs.length)}
                icon={<Check />}
              />
              <InsightTile
                label="Active days · 30d"
                value={`${activeDaysLast30}/30`}
                icon={<CalendarDays />}
              />
              <InsightTile
                label="Current streak"
                value={`${selectedStreak?.current ?? 0} days`}
                icon={<Flame />}
              />
              <InsightTile
                label="Best streak"
                value={`${selectedStreak?.longest ?? 0} days`}
                icon={<Award />}
              />
            </div>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="size-4 text-primary" /> Focus time on this habit
              </span>
              <span className="font-semibold">{formatMinutes(focusedMinutes)}</span>
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground sm:hidden">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              {motivation}
            </p>
          </div>
        ) : habits.length ? (
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <InsightTile label="Total check-ins" value={String(logs.length)} icon={<Check />} />
            <InsightTile
              label="Active days · 30d"
              value={`${activeDaysLast30}/30`}
              icon={<CalendarDays />}
            />
            <InsightTile label="Habits tracked" value={String(habits.length)} icon={<Target />} />
            <InsightTile
              label="Focus time"
              value={formatMinutes(focusedMinutes)}
              icon={<Clock3 />}
            />
          </div>
        ) : (
          <p className="mb-5 rounded-2xl bg-cell/60 p-4 text-sm text-muted-foreground">
            Add your first habit whenever you’re ready. Your day reflections are available below in
            the meantime.
          </p>
        )}

        <div className="overflow-x-auto rounded-2xl border bg-cell/40 p-3">
          <div className="min-w-max">
            <div className="ml-4 grid auto-cols-[14px] grid-flow-col gap-1 pb-1 text-xs text-muted-foreground">
              {calendarWeeks.map((week, index) => {
                const previousMonth = calendarWeeks[index - 1]?.[0]?.getMonth();
                return (
                  <span key={index} className="h-4">
                    {week[0] && (index === 0 || week[0].getMonth() !== previousMonth)
                      ? format(week[0], "MMM")
                      : ""}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-2">
              <div className="grid grid-rows-7 gap-1 text-xs leading-[14px] text-muted-foreground">
                <span>M</span>
                <span>T</span>
                <span>W</span>
                <span>T</span>
                <span>F</span>
                <span>S</span>
                <span>S</span>
              </div>
              <div className="grid grid-flow-col grid-rows-7 auto-cols-[14px] gap-1">
                {calendarWeeks.flatMap((week) =>
                  week.map((date) => {
                    const key = dayKey(date);
                    const isFuture = key > today;
                    const count =
                      activeHabitId === ALL_HABITS
                        ? (logCounts.get(key) ?? 0)
                        : completions.has(`${activeHabitId}|${key}`)
                          ? 1
                          : 0;
                    const intensity =
                      activeHabitId === ALL_HABITS && habits.length ? count / habits.length : count;
                    const colorLevel =
                      count === 0
                        ? "bg-cell"
                        : intensity < 0.34
                          ? "bg-primary/30"
                          : intensity < 0.67
                            ? "bg-primary/60"
                            : "bg-primary";
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={isFuture}
                        title={
                          isFuture
                            ? `${key}: upcoming`
                            : `${key}: ${count} ${count === 1 ? "check-in" : "check-ins"}`
                        }
                        aria-label={
                          isFuture
                            ? `${key}: upcoming`
                            : `${key}: ${count} ${count === 1 ? "check-in" : "check-ins"}`
                        }
                        aria-pressed={selectedDay === key}
                        onClick={() => chooseDay(key)}
                        className={cn(
                          "size-3.5 rounded-[4px] transition-colors hover:ring-2 hover:ring-primary/50",
                          colorLevel,
                          selectedDay === key &&
                            "ring-2 ring-foreground ring-offset-1 ring-offset-surface",
                          isFuture && "pointer-events-none opacity-0",
                        )}
                      />
                    );
                  }),
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Select a day to review its check-ins and notes.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Less</span>
            <i className="size-3 rounded-sm bg-cell" />
            <i className="size-3 rounded-sm bg-primary/30" />
            <i className="size-3 rounded-sm bg-primary/60" />
            <i className="size-3 rounded-sm bg-primary" />
            <span>More</span>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border bg-background/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{format(selectedDate, "EEEE, MMMM d, yyyy")}</p>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {selectedDayCompletions.length}{" "}
              {selectedDayCompletions.length === 1 ? "habit completed" : "habits completed"}
            </span>
          </div>
          {selectedDayCompletions.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedDayCompletions.map((habit) => (
                <span
                  key={habit.id}
                  className="inline-flex items-center gap-2 rounded-full bg-cell px-2.5 py-1 text-xs"
                >
                  <HabitBadge
                    icon={habit.icon}
                    color={habit.color}
                    className="size-5 rounded-full [&_svg]:size-3"
                  />
                  {habit.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No check-ins for this selection yet. That’s okay — a fresh start is always one small
              step away.
            </p>
          )}
          <div className="mt-4 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Focus sessions</h3>
              <p className="text-xs text-muted-foreground">
                Total{" "}
                {formatMinutes(
                  selectedDayMinutesByMode.pomodoro + selectedDayMinutesByMode.stopwatch,
                )}{" "}
                · Pomodoro {formatMinutes(selectedDayMinutesByMode.pomodoro)} · Stopwatch{" "}
                {formatMinutes(selectedDayMinutesByMode.stopwatch)}
              </p>
            </div>
            {selectedDaySessions.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {selectedDaySessions.map(({ session, minutes }) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-cell/60 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {habits.find((habit) => habit.id === session.habit_id)?.name ?? "General"}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {session.mode === "pomodoro" ? "Pomodoro" : "Stopwatch"} ·{" "}
                        {format(new Date(session.started_at), "p")}
                        {session.ended_at ? `–${format(new Date(session.ended_at), "p")}` : "–now"}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono">{formatMinutes(minutes)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No focus sessions on this day.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-primary/10 bg-surface p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <NotebookPen className="size-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Day notes</h2>
            <p className="text-sm text-muted-foreground">
              {format(selectedDate, "EEEE, MMMM d, yyyy")}
            </p>
          </div>
        </div>
        <DayReflection day={selectedDay} note={dayNote} />
        {habits.length ? (
          <div className="mt-5 space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Notes for each habit</h3>
            {habits.map((habit) => (
              <label key={habit.id} className="block rounded-2xl bg-cell/70 p-3">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <HabitBadge
                    icon={habit.icon}
                    color={habit.color}
                    className="size-7 rounded-lg [&_svg]:size-4"
                  />
                  {habit.name}
                </span>
                <textarea
                  rows={2}
                  defaultValue={noteByHabit.get(habit.id) ?? ""}
                  key={`${habit.id}|${selectedDay}|${noteByHabit.get(habit.id) ?? ""}`}
                  maxLength={2000}
                  placeholder="What went well? Add a note for this day…"
                  className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  onBlur={(event) => {
                    const note = event.currentTarget.value.trim();
                    if (note !== (noteByHabit.get(habit.id) ?? ""))
                      saveNote.mutate({ habit_id: habit.id, day: selectedDay, note });
                  }}
                />
              </label>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: import("react").ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-primary/10 bg-primary/[0.035] p-4">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      <p className="mt-1 font-mono text-lg font-bold sm:text-xl">{value}</p>
    </div>
  );
}

function InsightTile({
  icon,
  label,
  value,
}: {
  icon: import("react").ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-background/70 p-3">
      <span className="flex items-center gap-1.5 text-xs leading-tight text-muted-foreground">
        {icon}
        {label}
      </span>
      <p className="mt-1 font-mono text-lg font-bold">{value}</p>
    </div>
  );
}

function DayReflection({ day, note }: { day: string; note: string }) {
  const [draft, setDraft] = useState(note);
  const save = useSaveDayNote();
  const isDirty = draft.trim() !== note.trim();

  useEffect(() => {
    setDraft(note);
  }, [day, note]);

  return (
    <div className="rounded-2xl bg-cell/60 p-3">
      <label htmlFor="day-reflection" className="mb-2 block text-sm font-medium">
        Day reflection
      </label>
      <textarea
        id="day-reflection"
        rows={3}
        maxLength={2000}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Write a quick reflection about your day. Your notes are private to you."
        className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{draft.length}/2000 characters</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isDirty || save.isPending}
          onClick={() => save.mutate({ day, note: draft })}
        >
          {save.isPending ? "Saving…" : save.isSuccess && !isDirty ? "Saved" : "Save reflection"}
        </Button>
      </div>
    </div>
  );
}
