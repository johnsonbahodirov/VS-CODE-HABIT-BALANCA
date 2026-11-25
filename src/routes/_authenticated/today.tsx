import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Clock3, Flame, Plus, Play, Timer, Trophy, X } from "lucide-react";
import { HabitList, TimerCard, type TimerSnapshot } from "@/components/app-widgets";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { DatabaseErrorNotice } from "@/components/database-error-notice";
import { DailyGoalSuggestionDialog } from "@/components/daily-goal-suggestion-dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { dayKey, formatMinutes, minutesByDay, minutesByHabitAndDay } from "@/lib/balance";
import { getTodayFocusPlan, getTodayHabits } from "@/lib/today";
import {
  useAchievements,
  useHabitLogs,
  useHabits,
  useSessions,
  useSettings,
  useSocialOverview,
  useXPSummary,
} from "@/lib/data";
import {
  ACHIEVEMENTS,
  detectComeback,
  getAchievementProgress,
  scheduledStreakStats,
} from "@/lib/gamification";
import { calculateAchievementUserStats } from "@/lib/achievement-stats";
import { playOptionalSound, vibrate } from "@/lib/haptics";
import { isHabitSkippedOnDay } from "@/lib/today";
import { COPY } from "@/lib/strings";

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
  const socialQuery = useSocialOverview();
  const xpQuery = useXPSummary();

  const [dismissedComeback, setDismissedComeback] = useState(false);
  const [newHabitOpen, setNewHabitOpen] = useState(false);
  const [selectedTimedHabitId, setSelectedTimedHabitId] = useState("");
  const [timerClosed, setTimerClosed] = useState(getInitialTimerClosed);
  const [mobileTimerOpen, setMobileTimerOpen] = useState(false);
  const [todaySummaryOpen, setTodaySummaryOpen] = useState(true);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const [celebrationDay, setCelebrationDay] = useState("");
  const [confirmedCompletionDay, setConfirmedCompletionDay] = useState("");
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
    const mobileBreakpoint = window.matchMedia("(max-width: 767px)");
    const closeDrawerOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobileTimerOpen(false);
    };
    mobileBreakpoint.addEventListener("change", closeDrawerOnDesktop);
    return () => {
      mobileBreakpoint.removeEventListener("change", closeDrawerOnDesktop);
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
      if (window.matchMedia("(max-width: 767px)").matches) timerTrigger?.focus();
    };
  }, [mobileTimerOpen]);

  const todayKeyStr = dayKey(now);
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const habits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const logs = useMemo(() => logsQuery.data ?? [], [logsQuery.data]);
  const achievementStats = useMemo(
    () => calculateAchievementUserStats(habits, logs, xpQuery.data?.totalXp ?? 0, todayKeyStr),
    [habits, logs, todayKeyStr, xpQuery.data?.totalXp],
  );

  useEffect(() => {
    const activeSession = sessions.find((session) => !session.ended_at);
    if (activeSession?.habit_id) setSelectedTimedHabitId(activeSession.habit_id);
  }, [sessions]);

  const unlocked = useMemo(
    () => new Set((achievementsQuery.data?.unlocked ?? []).map((item) => item.achievement_key)),
    [achievementsQuery.data?.unlocked],
  );
  const nextAchievement = useMemo(() => {
    const candidates = (achievementsQuery.data?.catalog ?? [])
      .flatMap((item) => {
        const definition = ACHIEVEMENTS.find((achievement) => achievement.key === item.key);
        return definition
          ? [{ ...item, progress: getAchievementProgress(definition, achievementStats) }]
          : [];
      })
      .filter((item) => !unlocked.has(item.key));
    candidates.sort(
      (left, right) =>
        right.progress.percentage - left.progress.percentage || left.sort_order - right.sort_order,
    );
    return candidates[0] ?? null;
  }, [achievementsQuery.data?.catalog, achievementStats, unlocked]);

  const pomodorosToday = sessions.filter(
    (session) =>
      session.mode === "pomodoro" && dayKey(new Date(session.started_at)) === todayKeyStr,
  ).length;
  const focusMinutesToday = minutesByDay(sessions, now).get(todayKeyStr) ?? 0;

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
  const countedHabits = scheduledHabits.filter((habit) => !isHabitSkippedOnDay(habit, todayKeyStr));
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

  const completedToday = countedHabits.filter((habit) => completedHabitIds.has(habit.id)).length;
  const allHabitsDone = countedHabits.length > 0 && completedToday === countedHabits.length;
  const celebrationHandled = useRef<string | null>(null);

  useEffect(() => {
    const handleConfirmedCompletion = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string")
        setConfirmedCompletionDay(event.detail);
    };
    window.addEventListener("balance-habit-completion-confirmed", handleConfirmedCompletion);
    return () =>
      window.removeEventListener("balance-habit-completion-confirmed", handleConfirmedCompletion);
  }, []);

  useEffect(() => {
    if (
      !allHabitsDone ||
      confirmedCompletionDay !== todayKeyStr ||
      habitsQuery.isLoading ||
      logsQuery.isLoading
    )
      return;
    if (celebrationHandled.current === todayKeyStr) return;
    celebrationHandled.current = todayKeyStr;
    const key = `balance-all-done-${todayKeyStr}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "true");
    } catch (error) {
      console.warn("Could not save today's celebration state.", error);
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setCelebrationDay(todayKeyStr);
    vibrate([30, 50, 30, 50, 60]);
    playOptionalSound("all-done");
    const timeout = window.setTimeout(() => setCelebrationDay(""), 1200);
    return () => window.clearTimeout(timeout);
  }, [
    allHabitsDone,
    confirmedCompletionDay,
    habitsQuery.isLoading,
    logsQuery.isLoading,
    todayKeyStr,
  ]);

  const completionRate = countedHabits.length
    ? Math.round((completedToday / countedHabits.length) * 100)
    : 0;

  const progressNote = allHabitsDone
    ? COPY.today.progress.complete
    : completedToday === 0
      ? COPY.today.progress.start
      : completedToday * 2 < countedHabits.length
        ? COPY.today.progress.beginning
        : COPY.today.progress.halfway;
  const greetingHour = now.getHours();
  const greeting =
    greetingHour >= 5 && greetingHour < 12
      ? COPY.today.morning
      : greetingHour >= 12 && greetingHour < 18
        ? COPY.today.afternoon
        : COPY.today.evening;
  const firstName = socialQuery.data?.profile.display_name.trim().split(/\s+/)[0];
  const waitingCount = Math.max(0, countedHabits.length - completedToday);

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
  const selectTimedHabit = (habitId: string) => {
    setSelectedTimedHabitId(habitId);
    if (!habitId) return;
    setTimerClosed(false);
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileTimerOpen(true);
    } else {
      window.requestAnimationFrame(() =>
        document.getElementById("focus-timer")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "nearest",
        }),
      );
    }
  };

  return (
    <>
      <DailyGoalSuggestionDialog />
      <div className="today-layout grid grid-cols-1 gap-4 min-[768px]:grid-cols-[minmax(0,1fr)_300px] min-[1100px]:gap-5">
        <section className="today-main-column min-w-0 space-y-5">
          {(sessionsQuery.isError ||
            settingsQuery.isError ||
            habitsQuery.isError ||
            logsQuery.isError ||
            achievementsQuery.isError ||
            xpQuery.isError) && (
            <DatabaseErrorNotice
              title="Today’s progress could not be fully loaded"
              error={
                sessionsQuery.error ??
                settingsQuery.error ??
                habitsQuery.error ??
                logsQuery.error ??
                achievementsQuery.error ??
                xpQuery.error
              }
              onRetry={() => {
                void Promise.all([
                  sessionsQuery.refetch(),
                  settingsQuery.refetch(),
                  habitsQuery.refetch(),
                  logsQuery.refetch(),
                  achievementsQuery.refetch(),
                  xpQuery.refetch(),
                ]);
              }}
            />
          )}
          {habitsQuery.isLoading ||
          logsQuery.isLoading ||
          sessionsQuery.isLoading ||
          settingsQuery.isLoading ||
          achievementsQuery.isLoading ||
          xpQuery.isLoading ? (
            <div aria-label="Loading today’s habits" className="space-y-3">
              <div className="h-36 animate-pulse rounded-3xl border bg-cell/70" />
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl border bg-cell/70" />
              ))}
            </div>
          ) : (
            <>
              <section
                className={`relative overflow-hidden rounded-[var(--radius-card)] border bg-surface p-5 shadow-[var(--shadow-card)] ${
                  celebrationDay === todayKeyStr ? "today-completion-glow" : ""
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Today · {date}</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight">
                      {allHabitsDone
                        ? COPY.today.progress.allDone
                        : `${greeting}${firstName ? `, ${firstName}` : ""}`}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {countedHabits.length
                        ? COPY.today.waiting(waitingCount)
                        : COPY.today.progress.noneScheduled}
                    </p>
                    <p className="mt-1 text-sm font-medium text-primary">{progressNote}</p>
                  </div>
                  <div
                    className="relative flex size-24 shrink-0 items-center justify-center self-center sm:size-28"
                    role="progressbar"
                    aria-label="Today's habit completion"
                    aria-valuenow={completionRate}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <svg aria-hidden="true" viewBox="0 0 80 80" className="size-full -rotate-90">
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        fill="none"
                        stroke="var(--cell)"
                        strokeWidth="7"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 34}
                        strokeDashoffset={(2 * Math.PI * 34 * (100 - completionRate)) / 100}
                        className="today-progress-ring"
                      />
                    </svg>
                    <span className="absolute font-mono text-sm font-semibold tabular-nums">
                      {completedToday}/{countedHabits.length}
                    </span>
                  </div>
                  <div
                    className={`flex items-center justify-between gap-3 rounded-[18px] px-4 py-3 transition-colors duration-200 sm:min-w-[190px] sm:justify-center ${
                      currentStreak > 0 && completedToday === 0
                        ? "bg-orange-500/10"
                        : "bg-primary/10"
                    }`}
                  >
                    <Flame
                      className={`size-5 shrink-0 ${
                        currentStreak > 0 && completedToday === 0
                          ? "text-orange-500"
                          : "text-primary"
                      }`}
                    />
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
                      {currentStreak > 0 && completedToday === 0 && (
                        <p className="mt-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                          {COPY.today.progress.streakWarning}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
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

              <section className="today-habits-section pb-20">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Habits</h2>
                  <Button
                    type="button"
                    className="min-h-10 shrink-0 bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]"
                    onClick={() => setNewHabitOpen(true)}
                  >
                    <Plus className="size-4" /> New habit
                  </Button>
                </div>

                {habits.length === 0 ? (
                  <div className="today-habit-list-host py-1">
                    <HabitList
                      showGrid={false}
                      todayOnly
                      onCreateHabit={() => setNewHabitOpen(true)}
                    />
                  </div>
                ) : scheduledHabits.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    {COPY.today.progress.noneScheduled}
                  </p>
                ) : (
                  <div className="today-habit-list-host py-1">
                    <HabitList
                      showGrid={false}
                      todayOnly
                      selectableTimed
                      selectedHabitId={selectedTimedHabitId}
                      onSelectHabit={selectTimedHabit}
                      onCreateHabit={() => setNewHabitOpen(true)}
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
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
                  timerClosed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                }`}
              >
                <div
                  className="min-h-0 overflow-hidden"
                  aria-hidden={timerClosed}
                  inert={timerClosed}
                >
                  <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">Focus timer</h2>
                    <button
                      ref={timerCloseRef}
                      type="button"
                      aria-label={
                        mobileTimerOpen ? "Close focus timer panel" : "Collapse focus timer"
                      }
                      onClick={() => {
                        if (window.matchMedia("(max-width: 767px)").matches) {
                          setMobileTimerOpen(false);
                        } else {
                          setTimerClosed(true);
                        }
                      }}
                      className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring min-[768px]:hidden"
                    >
                      <X className="size-5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Collapse focus timer"
                      onClick={() => setTimerClosed(true)}
                      className="hidden size-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring min-[768px]:flex"
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
                    {pomodorosToday} · {formatMinutes(focusMinutesToday)}
                  </span>
                </div>
                {focusPlan.plannedMinutes > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Focus plan</span>
                      <span className="font-semibold tabular-nums">
                        {formatMinutes(focusPlan.completedMinutes)} / {formatMinutes(dailyGoal)}
                      </span>
                    </div>
                    <Progress value={focusPlan.percentage} className="h-2" />
                  </div>
                )}
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
                  <span className="flex min-w-0 items-center gap-2">
                    <Trophy className="size-4 shrink-0 text-primary" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs font-medium text-muted-foreground">
                        Next achievement
                      </span>
                      <span className="truncate text-sm font-semibold">{nextAchievement.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {nextAchievement.progress.label}
                      </span>
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-4 text-muted-foreground transition-transform ${achievementOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  id="next-achievement-content"
                  hidden={!achievementOpen}
                  className="space-y-2 pt-2"
                >
                  <Progress value={nextAchievement.progress.percentage} className="h-2" />
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {nextAchievement.description}
                    </span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
                      +{nextAchievement.reward_xp} XP
                    </span>
                  </div>
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
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 z-20 flex min-h-12 items-center gap-2 rounded-full border bg-surface px-4 text-sm font-semibold text-primary shadow-lg transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring min-[768px]:hidden"
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
