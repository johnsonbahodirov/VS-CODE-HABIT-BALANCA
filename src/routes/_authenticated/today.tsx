import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Leaf,
  Plus,
  Sparkles,
  Target,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import { HabitList, TimerCard, type TimerSnapshot } from "@/components/app-widgets";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { DatabaseErrorNotice } from "@/components/database-error-notice";
import { DailyGoalSuggestionDialog } from "@/components/daily-goal-suggestion-dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { dayKey, formatMinutes, minutesByHabitAndDay } from "@/lib/balance";
import { getTodayFocusPlan, getTodayHabits } from "@/lib/today";
import {
  useAchievements,
  useAddHabit,
  useHabitLogs,
  useHabits,
  useSessions,
  useSettings,
} from "@/lib/data";
import { detectComeback, scheduledStreakStats } from "@/lib/gamification";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [{ title: "Today — Balance" }] }),
  component: Today,
});

function useCurrentTime(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  return now;
}

function getInitialWidgetCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  const narrowViewport =
    typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1199px)").matches;
  try {
    return narrowViewport || window.localStorage.getItem("balance-widget-collapsed") === "true";
  } catch (error) {
    console.warn("Could not restore the timer panel state.", error);
    return narrowViewport;
  }
}

function Today() {
  const now = useCurrentTime();
  const date = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const sessionsQuery = useSessions();
  const settingsQuery = useSettings();
  const habitsQuery = useHabits();
  const logsQuery = useHabitLogs();
  const achievementsQuery = useAchievements();
  const addHabit = useAddHabit();

  const [dismissedComeback, setDismissedComeback] = useState(false);
  const [newHabitOpen, setNewHabitOpen] = useState(false);
  const [selectedTimedHabitId, setSelectedTimedHabitId] = useState("");
  const [widgetCollapsed, setWidgetCollapsed] = useState(getInitialWidgetCollapsed);
  const [mobileTimerOpen, setMobileTimerOpen] = useState(false);
  const [todaySummaryOpen, setTodaySummaryOpen] = useState(true);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const [timerSnapshot, setTimerSnapshot] = useState<TimerSnapshot>({
    active: false,
    time: "25:00",
  });
  const timerTriggerRef = useRef<HTMLButtonElement>(null);
  const timerCloseRef = useRef<HTMLButtonElement>(null);
  const onTimerSnapshot = useCallback((snapshot: TimerSnapshot) => {
    setTimerSnapshot((current) =>
      current.active === snapshot.active && current.time === snapshot.time ? current : snapshot,
    );
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("balance-widget-collapsed", String(widgetCollapsed));
    } catch (error) {
      console.warn("Could not save the timer panel state.", error);
    }
  }, [widgetCollapsed]);

  useEffect(() => {
    const breakpoint = window.matchMedia("(max-width: 1199px)");
    const mobileBreakpoint = window.matchMedia("(max-width: 1023px)");
    const collapseForWidth = (event: MediaQueryListEvent) => {
      if (event.matches) setWidgetCollapsed(true);
      else setMobileTimerOpen(false);
    };
    const closeMobileSheet = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobileTimerOpen(false);
    };
    breakpoint.addEventListener("change", collapseForWidth);
    mobileBreakpoint.addEventListener("change", closeMobileSheet);
    return () => {
      breakpoint.removeEventListener("change", collapseForWidth);
      mobileBreakpoint.removeEventListener("change", closeMobileSheet);
    };
  }, []);

  useEffect(() => {
    if (!mobileTimerOpen) return;
    const timerTrigger = timerTriggerRef.current;
    timerCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileTimerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (window.matchMedia("(max-width: 1023px)").matches) timerTrigger?.focus();
    };
  }, [mobileTimerOpen]);

  const todayKeyStr = dayKey(now);
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const habits = habitsQuery.data ?? [];
  const logs = useMemo(() => logsQuery.data ?? [], [logsQuery.data]);

  useEffect(() => {
    const activeSession = sessions.find((session) => !session.ended_at);
    if (activeSession?.habit_id) setSelectedTimedHabitId(activeSession.habit_id);
  }, [sessions]);

  const unlocked = new Set(
    (achievementsQuery.data?.unlocked ?? []).map((item) => item.achievement_key),
  );
  const nextAchievement = achievementsQuery.data?.catalog.find((item) => !unlocked.has(item.key));

  const pomodoroSessionsToday = sessions.filter(
    (session) =>
      session.mode === "pomodoro" &&
      session.ended_at &&
      dayKey(new Date(session.started_at)) === todayKeyStr,
  );
  const pomodorosToday = pomodoroSessionsToday.length;
  const pomodoroMinutesToday = pomodoroSessionsToday.reduce(
    (total, session) =>
      total +
      (new Date(session.ended_at!).getTime() - new Date(session.started_at).getTime()) / 60000,
    0,
  );

  const isNewUser = !habitsQuery.isLoading && !habitsQuery.isError && habits.length === 0;

  const comebackData = useMemo(() => {
    if (isNewUser || logs.length === 0) return null;

    const completedDays = logs.map((log) => log.day);
    const info = detectComeback(completedDays, todayKeyStr, 7);

    let effectiveInactiveDays = info.daysInactive;
    if (typeof window !== "undefined") {
      const lastVisit = localStorage.getItem("balance_last_visit_date");
      if (lastVisit && lastVisit !== todayKeyStr) {
        const diff = Math.round(
          (new Date(`${todayKeyStr}T12:00:00`).getTime() -
            new Date(`${lastVisit}T12:00:00`).getTime()) /
            86400000,
        );
        if (diff > effectiveInactiveDays) effectiveInactiveDays = diff;
      }
    }

    return {
      isComeback: effectiveInactiveDays >= 7,
      daysInactive: effectiveInactiveDays,
    };
  }, [isNewUser, logs, todayKeyStr]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ack = localStorage.getItem(`balance_comeback_ack_${todayKeyStr}`);
    if (ack) setDismissedComeback(true);
    localStorage.setItem("balance_last_visit_date", todayKeyStr);
  }, [todayKeyStr]);

  const scheduledHabits = getTodayHabits(habits, todayKeyStr);
  const todayMinutesByHabit = minutesByHabitAndDay(sessions, now);
  const focusPlan = getTodayFocusPlan(habits, todayMinutesByHabit, todayKeyStr);
  const dailyGoal = focusPlan.plannedMinutes;
  const nextReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const resetMinutes = Math.max(0, Math.floor((nextReset.getTime() - now.getTime()) / 60000));
  const resetCountdown = `${Math.floor(resetMinutes / 60)}h ${String(resetMinutes % 60).padStart(2, "0")}m`;

  const completedHabitIds = new Set(
    logs
      .filter((log) => {
        const habit = habits.find((item) => item.id === log.habit_id);
        if (!habit || log.day !== todayKeyStr) return false;

        return habit.tracking_type === "count"
          ? (log.count ?? 0) >= (habit.daily_goal_count ?? 1)
          : (log.count ?? 1) >= 1;
      })
      .map((log) => log.habit_id),
  );

  const completedToday = scheduledHabits.filter((habit) => completedHabitIds.has(habit.id)).length;

  const completionRate = scheduledHabits.length
    ? Math.round((completedToday / scheduledHabits.length) * 100)
    : 0;

  const progressNote =
    scheduledHabits.length === 0
      ? "Nothing scheduled today"
      : completedToday === scheduledHabits.length
        ? "All done. Nice work"
        : completedToday === 0
          ? "Start with one small habit"
          : `${scheduledHabits.length - completedToday} to go`;

  const currentStreak = Math.max(
    0,
    ...scheduledHabits.map((habit) => {
      const completedDays = logs
        .filter((log) => {
          if (log.habit_id !== habit.id) return false;

          return habit.tracking_type === "count"
            ? (log.count ?? 0) >= (habit.daily_goal_count ?? 1)
            : (log.count ?? 1) >= 1;
        })
        .map((log) => log.day);

      return scheduledStreakStats(completedDays, todayKeyStr, habit).current;
    }),
  );

  const starters = [
    { name: "Drink water", icon: "droplets", category: "Health" },
    { name: "Read 20 minutes", icon: "book", category: "Learning" },
    { name: "Walk 30 minutes", icon: "footprints", category: "Health" },
  ];

  const addStarter = (starter: { name: string; icon: string; category: string }) =>
    addHabit.mutate({
      name: starter.name,
      color: "green",
      category: starter.category,
      icon: starter.icon,
      description: "",
      frequency: "daily",
      schedule_days: [0, 1, 2, 3, 4, 5, 6],
      difficulty: "medium",
      reminder_enabled: false,
      reminder_time: "09:00",
      tracking_type: "yes_no",
      habit_type: "yesno",
      daily_goal_count: 1,
      daily_goal_minutes: 0,
    });

  return (
    <>
      <DailyGoalSuggestionDialog />
      <div className="today-dashboard grid grid-cols-1 gap-6">
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{date}</p>
              <h1 className="text-3xl font-bold">Today</h1>
            </div>
            <span
              title={`Your day resets at midnight in ${Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time zone"}.`}
              aria-label={`Resets in ${resetCountdown}. Your local time zone is ${Intl.DateTimeFormat().resolvedOptions().timeZone || "not available"}.`}
              className="rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
            >
              Resets in {resetCountdown}
            </span>
          </div>

          {(sessionsQuery.isError ||
            settingsQuery.isError ||
            habitsQuery.isError ||
            logsQuery.isError ||
            achievementsQuery.isError) && (
            <div>
              <DatabaseErrorNotice
                title="Today’s progress could not be fully loaded"
                error={
                  sessionsQuery.error ??
                  settingsQuery.error ??
                  habitsQuery.error ??
                  logsQuery.error ??
                  achievementsQuery.error
                }
                onRetry={() => {
                  void Promise.all([
                    sessionsQuery.refetch(),
                    settingsQuery.refetch(),
                    habitsQuery.refetch(),
                    logsQuery.refetch(),
                    achievementsQuery.refetch(),
                  ]);
                }}
              />
            </div>
          )}

          {comebackData?.isComeback && !dismissedComeback && (
            <section className="relative overflow-hidden rounded-3xl border border-accent/40 bg-gradient-to-br from-accent/20 via-surface to-primary/10 p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-md shadow-accent/20">
                  <Sparkles className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-bold tracking-tight text-foreground">
                      Welcome back! 🌟
                    </h2>
                    <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-semibold text-accent">
                      {comebackData.daysInactive} days away
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/85">
                    Taking a break is completely normal and part of being human. True consistency
                    isn&apos;t about never pausing—it&apos;s about having the strength to return.
                    Let&apos;s make today count!
                  </p>
                  <div className="mt-3.5 flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                      className="rounded-full bg-accent font-semibold text-accent-foreground hover:bg-accent/90"
                      onClick={() => {
                        setDismissedComeback(true);
                        localStorage.setItem(`balance_comeback_ack_${todayKeyStr}`, "true");
                      }}
                    >
                      Let&apos;s do this! ✨
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedComeback(true);
                        localStorage.setItem(`balance_comeback_ack_${todayKeyStr}`, "true");
                      }}
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start xl:gap-8">
          {isNewUser ? (
            <section className="space-y-3 rounded-3xl border bg-gradient-to-br from-primary/10 via-surface to-surface p-5">
              <h2 className="text-lg font-semibold">Welcome to Balance</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Add one small habit you can finish every day.</li>
                <li>Tap the check when it is done and earn XP.</li>
                <li>Use the timer to track how long you focus on it.</li>
              </ol>
              <p className="pt-1 text-xs font-semibold text-muted-foreground">
                Start with one tap:
              </p>
              <div className="flex flex-wrap gap-2">
                {starters.map((starter) => (
                  <Button
                    key={starter.name}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={addHabit.isPending}
                    onClick={() => addStarter(starter)}
                  >
                    <Plus /> {starter.name}
                  </Button>
                ))}
              </div>
            </section>
          ) : (
            <section className="today-main-column mx-auto w-full max-w-[880px] space-y-6">
              <section className="relative overflow-hidden rounded-[var(--radius-card)] border bg-surface p-5 shadow-[var(--shadow-card)]">
                <Leaf
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-[-18px] left-[-16px] size-24 text-primary/[0.07]"
                />
                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Target className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">
                        Today&apos;s progress
                      </div>
                      <p className="mt-1 font-sans text-5xl font-bold leading-none tracking-[-0.04em] text-foreground tabular-nums sm:text-6xl">
                        {completedToday}/{scheduledHabits.length}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {completionRate}% done · {progressNote}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-[18px] bg-primary/10 px-4 py-3 sm:min-w-[190px] sm:justify-center">
                    <Flame className="size-5 shrink-0 text-primary" />
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        Current streak
                      </div>
                      <p className="mt-0.5 font-sans text-3xl font-bold text-foreground tabular-nums">
                        {currentStreak}{" "}
                        <span className="text-sm font-medium text-muted-foreground">
                          {currentStreak === 1 ? "day" : "days"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                <Progress
                  value={completionRate}
                  className="relative mt-4 h-2 rounded-full bg-cell"
                />
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold">Habits</h2>
                    <Link
                      to="/habits"
                      viewTransition
                      preload="intent"
                      preloadDelay={0}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Manage
                    </Link>
                  </div>
                  <Button
                    type="button"
                    className="hidden min-h-10 bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] md:inline-flex"
                    onClick={() => setNewHabitOpen(true)}
                  >
                    <Plus className="size-4" /> New habit
                  </Button>
                </div>

                <div className="py-1">
                  <HabitList
                    showGrid={false}
                    todayOnly
                    selectableTimed
                    selectedHabitId={selectedTimedHabitId}
                    onSelectHabit={setSelectedTimedHabitId}
                  />
                </div>
              </section>
            </section>
          )}

          <aside
            aria-label="Focus tools"
            data-collapsed={widgetCollapsed}
            data-mobile-open={mobileTimerOpen}
            className="today-widget-panel min-w-0 self-start transition-[width] duration-[230ms] ease-in-out"
            style={{ width: widgetCollapsed ? 64 : 340 }}
          >
            <div
              className="today-widget-rail flex-col items-center gap-2"
              data-collapsed={widgetCollapsed}
            >
              <button
                type="button"
                aria-label="Expand focus tools and open timer"
                title="Timer"
                onClick={() => {
                  setWidgetCollapsed(false);
                  setTodaySummaryOpen(false);
                  setAchievementOpen(false);
                }}
                className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary/15"
              >
                <Timer className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Expand focus tools and open today's summary"
                title="Today"
                onClick={() => {
                  setWidgetCollapsed(false);
                  setTodaySummaryOpen(true);
                  setAchievementOpen(false);
                }}
                className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <CalendarCheck className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Expand focus tools and open next achievement"
                title="Achievement"
                onClick={() => {
                  setWidgetCollapsed(false);
                  setTodaySummaryOpen(false);
                  setAchievementOpen(true);
                }}
                className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Trophy className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Expand focus tools"
                aria-expanded={false}
                aria-controls="focus-tools-panel"
                onClick={() => setWidgetCollapsed(false)}
                className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
              {timerSnapshot.active && (
                <button
                  type="button"
                  aria-label={`Open focus timer, ${timerSnapshot.time}`}
                  onClick={() => setWidgetCollapsed(false)}
                  className="rounded-full bg-primary px-2 py-1 text-xs font-semibold tabular-nums text-primary-foreground"
                >
                  {timerSnapshot.time}
                </button>
              )}
            </div>

            <div
              id="focus-tools-panel"
              className="today-widget-content space-y-4"
              data-collapsed={widgetCollapsed}
              data-mobile-open={mobileTimerOpen}
              role={mobileTimerOpen ? "dialog" : "complementary"}
              aria-modal={mobileTimerOpen ? true : undefined}
              aria-label="Focus tools"
            >
              <div className="mb-2 flex items-center justify-between lg:hidden">
                <h2 className="text-lg font-semibold">Focus timer</h2>
                <button
                  ref={timerCloseRef}
                  type="button"
                  aria-label="Close focus timer"
                  onClick={() => setMobileTimerOpen(false)}
                  className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="hidden items-center justify-end lg:flex">
                <button
                  type="button"
                  aria-label="Collapse focus tools"
                  aria-expanded={!widgetCollapsed}
                  aria-controls="focus-tools-panel"
                  onClick={() => setWidgetCollapsed(true)}
                  className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <div id="focus-timer" className="scroll-mt-5">
                <TimerCard
                  selectedHabitId={selectedTimedHabitId}
                  onSelectHabit={setSelectedTimedHabitId}
                  onTimerSnapshot={onTimerSnapshot}
                />
              </div>

              <section
                id="daily-plan"
                className="rounded-2xl border bg-surface p-4 shadow-[var(--shadow-card)]"
              >
                <button
                  type="button"
                  aria-expanded={todaySummaryOpen}
                  aria-controls="today-summary-content"
                  onClick={() => setTodaySummaryOpen((open) => !open)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <Clock3 className="size-4 text-primary" />
                    Today
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-4 text-muted-foreground transition-transform ${todaySummaryOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  id="today-summary-content"
                  hidden={!todaySummaryOpen}
                  className="space-y-3 pt-2"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Pomodoro sessions</span>
                    <span className="font-semibold">
                      {pomodorosToday} · {formatMinutes(pomodoroMinutesToday)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Focus plan</span>
                      <span className="font-semibold tabular-nums">
                        {dailyGoal > 0
                          ? `${formatMinutes(focusPlan.completedMinutes)} / ${formatMinutes(dailyGoal)}`
                          : "No focus goal"}
                      </span>
                    </div>
                    <Progress value={focusPlan.percentage} className="h-2" />
                  </div>
                </div>
              </section>

              {nextAchievement && (
                <section className="rounded-2xl border bg-surface p-4 shadow-[var(--shadow-card)]">
                  <button
                    type="button"
                    aria-expanded={achievementOpen}
                    aria-controls="next-achievement-content"
                    onClick={() => setAchievementOpen((open) => !open)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Trophy className="size-4 text-primary" />
                      Next achievement
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 text-muted-foreground transition-transform ${achievementOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <div
                    id="next-achievement-content"
                    hidden={!achievementOpen}
                    className="flex items-center gap-3 pt-2"
                  >
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {nextAchievement.name}
                    </p>
                    <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      +{nextAchievement.reward_xp} XP
                    </span>
                  </div>
                </section>
              )}
            </div>
          </aside>
        </div>
      </div>
      <button
        ref={timerTriggerRef}
        type="button"
        aria-label={
          timerSnapshot.active ? `Open focus timer, ${timerSnapshot.time}` : "Open focus timer"
        }
        onClick={() => setMobileTimerOpen(true)}
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 z-20 flex min-h-12 items-center gap-2 rounded-full border bg-surface px-4 text-sm font-semibold text-primary shadow-lg lg:hidden"
      >
        <Timer className="size-4" />
        {timerSnapshot.active ? (
          <span className="tabular-nums">{timerSnapshot.time}</span>
        ) : (
          <span>Timer</span>
        )}
      </button>
      <Button
        type="button"
        size="icon"
        aria-label="Add new habit"
        onClick={() => setNewHabitOpen(true)}
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-20 size-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-[var(--primary-hover)] md:hidden"
      >
        <Plus className="size-6" />
      </Button>
      {mobileTimerOpen && (
        <button
          type="button"
          aria-label="Close focus timer"
          onClick={() => setMobileTimerOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/30 lg:hidden"
        />
      )}
      <HabitFormDialog open={newHabitOpen} onOpenChange={setNewHabitOpen} />
    </>
  );
}
