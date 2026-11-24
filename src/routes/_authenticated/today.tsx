import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Clock3, Flame, Plus, Play, Timer, Trophy, X } from "lucide-react";
import { HabitList, TimerCard, type TimerSnapshot } from "@/components/app-widgets";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { DatabaseErrorNotice } from "@/components/database-error-notice";
import { DailyGoalSuggestionDialog } from "@/components/daily-goal-suggestion-dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { dayKey, formatMinutes, minutesByHabitAndDay } from "@/lib/balance";
import { getTodayFocusPlan, getTodayHabits } from "@/lib/today";
import { useAchievements, useHabitLogs, useHabits, useSessions, useSettings } from "@/lib/data";
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

function getInitialTimerClosed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("balance-widget-collapsed") === "true";
  } catch (error) {
    console.warn("Could not restore the timer panel state.", error);
    return false;
  }
}

function Today() {
  const now = useCurrentTime();
  const date = now.toLocaleDateString([], {
    weekday: "short",
    month: "long",
    day: "numeric",
  });

  const sessionsQuery = useSessions();
  const settingsQuery = useSettings();
  const habitsQuery = useHabits();
  const logsQuery = useHabitLogs();
  const achievementsQuery = useAchievements();

  const [dismissedComeback, setDismissedComeback] = useState(false);
  const [newHabitOpen, setNewHabitOpen] = useState(false);
  const [selectedTimedHabitId, setSelectedTimedHabitId] = useState("");
  const [timerClosed, setTimerClosed] = useState(getInitialTimerClosed);
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
      window.localStorage.setItem("balance-widget-collapsed", String(timerClosed));
    } catch (error) {
      console.warn("Could not save the timer panel state.", error);
    }
  }, [timerClosed]);

  useEffect(() => {
    const tabletBreakpoint = window.matchMedia("(max-width: 1099px)");
    const closeDrawerOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobileTimerOpen(false);
    };
    tabletBreakpoint.addEventListener("change", closeDrawerOnDesktop);
    return () => {
      tabletBreakpoint.removeEventListener("change", closeDrawerOnDesktop);
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
      if (window.matchMedia("(max-width: 1099px)").matches) timerTrigger?.focus();
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
        ? "All done. Nice work."
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

  return (
    <>
      <DailyGoalSuggestionDialog />
      <div className="today-layout grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_330px]">
        <section className="today-main-column min-w-0 space-y-5">
          {(sessionsQuery.isError ||
            settingsQuery.isError ||
            habitsQuery.isError ||
            logsQuery.isError ||
            achievementsQuery.isError) && (
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
          )}
          {habitsQuery.isLoading ||
          logsQuery.isLoading ||
          sessionsQuery.isLoading ||
          settingsQuery.isLoading ||
          achievementsQuery.isLoading ? (
            <div aria-label="Loading today’s habits" className="space-y-3">
              <div className="h-36 animate-pulse rounded-3xl border bg-cell/70" />
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl border bg-cell/70" />
              ))}
            </div>
          ) : (
            <>
              <section className="relative overflow-hidden rounded-[var(--radius-card)] border bg-surface p-5 shadow-[var(--shadow-card)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Today · {date}</p>
                    <p
                      key={completedToday}
                      className="number-tick mt-1 font-sans text-4xl font-bold leading-none tracking-[-0.04em] text-foreground tabular-nums"
                    >
                      {completedToday}/{scheduledHabits.length}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {completionRate}% done · {progressNote}
                    </p>
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
                {comebackData?.isComeback && !dismissedComeback && (
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>Welcome back after {comebackData.daysInactive} days away.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedComeback(true);
                        localStorage.setItem(`balance_comeback_ack_${todayKeyStr}`, "true");
                      }}
                      className="min-h-11 shrink-0 rounded-lg px-2 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </section>

              <section className="pb-20">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-4">
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
                    className="min-h-10 shrink-0 bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]"
                    onClick={() => setNewHabitOpen(true)}
                  >
                    <Plus className="size-4" /> New habit
                  </Button>
                </div>

                {scheduledHabits.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">Nothing scheduled today.</p>
                ) : (
                  <div className="py-1">
                    <HabitList
                      showGrid={false}
                      todayOnly
                      selectableTimed
                      selectedHabitId={selectedTimedHabitId}
                      onSelectHabit={setSelectedTimedHabitId}
                    />
                  </div>
                )}
              </section>
            </>
          )}
        </section>

        <aside
          aria-label="Focus tools"
          data-mobile-open={mobileTimerOpen}
          className="today-widget-panel min-w-0 self-start"
        >
          <div
            id="focus-tools-panel"
            className="today-widget-content flex flex-col gap-3"
            data-mobile-open={mobileTimerOpen}
            role={mobileTimerOpen ? "dialog" : "complementary"}
            aria-modal={mobileTimerOpen ? true : undefined}
            aria-label="Focus tools"
          >
            <section id="focus-timer" className="min-w-0">
              {timerClosed && (
                <button
                  type="button"
                  aria-label={`Open focus timer, ${timerSnapshot.time}`}
                  onClick={() => setTimerClosed(false)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border bg-surface px-4 font-mono text-sm font-semibold tabular-nums text-foreground shadow-[var(--shadow-card)] transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{timerSnapshot.time}</span>
                  <Play aria-hidden="true" className="size-4 fill-current text-primary" />
                </button>
              )}
              <div className={timerClosed ? "hidden" : ""}>
                <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Focus timer</h2>
                  <button
                    ref={timerCloseRef}
                    type="button"
                    aria-label={
                      mobileTimerOpen ? "Close focus timer panel" : "Collapse focus timer"
                    }
                    onClick={() => {
                      if (window.matchMedia("(max-width: 1099px)").matches) {
                        setMobileTimerOpen(false);
                      } else {
                        setTimerClosed(true);
                      }
                    }}
                    className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring min-[1100px]:hidden"
                  >
                    <X className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Collapse focus timer"
                    onClick={() => setTimerClosed(true)}
                    className="hidden size-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring min-[1100px]:flex"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>
                <TimerCard
                  selectedHabitId={selectedTimedHabitId}
                  onSelectHabit={setSelectedTimedHabitId}
                  onTimerSnapshot={onTimerSnapshot}
                />
              </div>
            </section>

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
              <div id="today-summary-content" hidden={!todaySummaryOpen} className="space-y-3 pt-2">
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
      <button
        ref={timerTriggerRef}
        type="button"
        aria-label={
          timerSnapshot.active ? `Open focus timer, ${timerSnapshot.time}` : "Open focus timer"
        }
        onClick={() => setMobileTimerOpen(true)}
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 z-20 flex min-h-12 items-center gap-2 rounded-full border bg-surface px-4 text-sm font-semibold text-primary shadow-lg transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring min-[1100px]:hidden"
      >
        <Timer className="size-4" />
        {timerSnapshot.active ? (
          <span className="tabular-nums">{timerSnapshot.time}</span>
        ) : (
          <span>Timer</span>
        )}
      </button>
      {mobileTimerOpen && (
        <button
          type="button"
          aria-label="Close focus timer"
          onClick={() => setMobileTimerOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/30 min-[1100px]:hidden"
        />
      )}
      <HabitFormDialog open={newHabitOpen} onOpenChange={setNewHabitOpen} />
    </>
  );
}
