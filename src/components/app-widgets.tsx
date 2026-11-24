import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Check,
  Trash2,
  Timer as TimerIcon,
  Archive,
  Pencil,
  Pause,
  PlayCircle,
  RotateCcw,
  Settings,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatabaseErrorNotice } from "@/components/database-error-notice";
import { cn } from "@/lib/utils";
import { dayKey, formatMinutes, minutesByHabitAndDay } from "@/lib/balance";
import { habitIcon } from "@/lib/habit-meta";
import {
  colorBg,
  useDeleteHabit,
  useDeleteSession,
  useHabitLogs,
  useHabits,
  useSessions,
  useSettings,
  useSaveSettings,
  useTimer,
  useToggleLog,
  useUpdateHabit,
} from "@/lib/data";
import { toast } from "sonner";
import {
  isHabitScheduledOnDay,
  scheduledStreakStats,
  xpRewardsForCompletion,
} from "@/lib/gamification";
import {
  getTodayHabits,
  getWeekDayKeys,
  getWeekStrip,
  isTimedHabit,
  type DayState,
} from "@/lib/today";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { TimerSettingsPanel, type TimerPreferences } from "@/components/timer-settings-panel";
import { playSound } from "@/lib/sounds";
import type { Database } from "@/integrations/supabase/types";

type Habit = Database["public"]["Tables"]["habits"]["Row"];
type PomodoroSettingsSnapshot = Pick<
  NonNullable<ReturnType<typeof useSettings>["data"]>,
  "pomodoro_focus_minutes" | "pomodoro_short_break_minutes" | "pomodoro_long_break_minutes"
> & { longBreakAfter: number };

const DEFAULT_TIMER_PREFERENCES: TimerPreferences = {
  longBreakAfter: 4,
  targetCount: 4,
  workSound: "none",
  breakSound: "none",
  chronometerSound: false,
  completionNotifications: false,
};

export type TimerSnapshot = {
  active: boolean;
  time: string;
};

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function TimerCard({
  selectedHabitId,
  onSelectHabit,
  onTimerSnapshot,
}: {
  selectedHabitId: string;
  onSelectHabit: (habitId: string) => void;
  onTimerSnapshot?: (snapshot: TimerSnapshot) => void;
}) {
  const { data: sessions = [] } = useSessions();
  const { data: habits = [] } = useHabits();
  const { data: settings } = useSettings();
  const timer = useTimer();
  const saveSettings = useSaveSettings();
  const now = useNow();
  const [mode, setMode] = useState<"stopwatch" | "pomodoro">("stopwatch");
  const [focusEndsAt, setFocusEndsAt] = useState<number | null>(null);
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);
  const [timerStateRestored, setTimerStateRestored] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pausedRemainingMs, setPausedRemainingMs] = useState<number | null>(null);
  const [elapsedBeforePauseMs, setElapsedBeforePauseMs] = useState(0);
  const [pausedHabitId, setPausedHabitId] = useState<string | null>(null);
  const [breakReady, setBreakReady] = useState(false);
  const [nextBreakMinutes, setNextBreakMinutes] = useState(5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [notificationHint, setNotificationHint] = useState("");
  const [timerAnnouncement, setTimerAnnouncement] = useState("");
  const [timerPreferences, setTimerPreferences] =
    useState<TimerPreferences>(DEFAULT_TIMER_PREFERENCES);
  const [sessionSettings, setSessionSettings] = useState<PomodoroSettingsSnapshot | null>(null);
  const originalTitle = useRef<string | null>(null);
  const completedFocus = useRef(false);
  const [plan, setPlan] = useState<{ target: number; done: number } | null>(null);

  const running = sessions.find((session) => !session.ended_at);
  const runningId = running?.id;
  const runningMode = running?.mode;
  const selectableHabits = habits.filter(
    (habit) =>
      isTimedHabit(habit) &&
      !habit.is_paused &&
      !habit.archived_at &&
      isHabitScheduledOnDay(habit, dayKey(now)),
  );
  const completedSessions = useMemo(
    () => sessions.filter((session) => session.ended_at),
    [sessions],
  );
  const cycles = completedSessions.filter((session) => session.mode === "pomodoro").length;
  const runningMin = running
    ? Math.max(0, now.getTime() - new Date(running.started_at).getTime()) / 60000
    : 0;
  const runningHabit = habits.find((habit) => habit.id === running?.habit_id);
  const currentHabitId = running?.habit_id ?? (paused ? pausedHabitId : selectedHabitId);
  const selected = selectableHabits.some((habit) => habit.id === currentHabitId)
    ? (currentHabitId ?? "")
    : "";

  const activeFocusEndsAt =
    focusEndsAt ??
    (running?.mode === "pomodoro"
      ? new Date(running.started_at).getTime() + (settings?.pomodoro_focus_minutes ?? 25) * 60000
      : null);

  const focusSeconds = Math.max(
    0,
    Math.ceil(((activeFocusEndsAt ?? now.getTime()) - now.getTime()) / 1000),
  );
  const breakSeconds = Math.max(
    0,
    Math.ceil(((breakEndsAt ?? now.getTime()) - now.getTime()) / 1000),
  );

  const displaySeconds =
    mode === "pomodoro"
      ? running && activeFocusEndsAt
        ? focusSeconds
        : breakEndsAt
          ? breakSeconds
          : paused && pausedRemainingMs !== null
            ? Math.ceil(pausedRemainingMs / 1000)
            : breakReady
              ? 0
              : (settings?.pomodoro_focus_minutes ?? 25) * 60
      : Math.floor(elapsedBeforePauseMs / 1000 + runningMin * 60);

  const formattedClock = `${String(Math.floor(displaySeconds / 60)).padStart(2, "0")}:${String(displaySeconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    onTimerSnapshot?.({
      active: Boolean(running || paused || breakEndsAt),
      time: formattedClock,
    });
  }, [breakEndsAt, formattedClock, onTimerSnapshot, paused, running]);

  const changeTimerPreference = <K extends keyof TimerPreferences>(
    key: K,
    value: TimerPreferences[K],
  ) => {
    if (key === "completionNotifications" && value === true) {
      if (typeof Notification === "undefined") {
        setNotificationHint("Notifications are not supported in this browser.");
        setTimerPreferences((current) => ({ ...current, completionNotifications: false }));
        return;
      }
      if (Notification.permission === "denied") {
        setNotificationHint("Allow notifications in your browser settings to enable them.");
        setTimerPreferences((current) => ({ ...current, completionNotifications: false }));
        return;
      }
      if (Notification.permission === "default") {
        void Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            setNotificationHint("");
            setTimerPreferences((current) => ({ ...current, completionNotifications: true }));
          } else {
            setNotificationHint("Allow notifications in your browser settings to enable them.");
            setTimerPreferences((current) => ({ ...current, completionNotifications: false }));
          }
        });
        return;
      }
      setNotificationHint("");
    } else if (key === "completionNotifications" && value === false) {
      setNotificationHint("");
    }

    setTimerPreferences((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("balance-pomodoro");
      if (!saved) {
        setTimerStateRestored(true);
        return;
      }

      const parsed = JSON.parse(saved) as {
        mode?: "stopwatch" | "pomodoro";
        focusEndsAt?: number | null;
        breakEndsAt?: number | null;
        breakReady?: boolean;
        paused?: boolean;
        pausedRemainingMs?: number | null;
        elapsedBeforePauseMs?: number;
        pausedHabitId?: string | null;
        nextBreakMinutes?: number;
        plan?: { target: number; done: number } | null;
        timerPreferences?: Partial<TimerPreferences>;
        sessionSettings?: PomodoroSettingsSnapshot | null;
      };

      // Do not restore an expired break timer.
      const validBreakEndsAt =
        parsed.breakEndsAt && parsed.breakEndsAt > Date.now() ? parsed.breakEndsAt : null;

      setPlan(parsed.plan ?? null);
      setMode(parsed.mode === "pomodoro" ? "pomodoro" : "stopwatch");
      setFocusEndsAt(parsed.focusEndsAt ?? null);
      setBreakEndsAt(validBreakEndsAt);
      setBreakReady(parsed.breakReady ?? false);
      setPaused(parsed.paused ?? false);
      setPausedRemainingMs(parsed.pausedRemainingMs ?? null);
      setElapsedBeforePauseMs(parsed.elapsedBeforePauseMs ?? 0);
      setPausedHabitId(parsed.pausedHabitId ?? null);
      setNextBreakMinutes(parsed.nextBreakMinutes ?? 5);
      setTimerPreferences({ ...DEFAULT_TIMER_PREFERENCES, ...parsed.timerPreferences });
      setSessionSettings(parsed.sessionSettings ?? null);
    } catch (error) {
      console.error("Could not restore the timer state.", error);
    } finally {
      setTimerStateRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!timerStateRestored) return;
    try {
      localStorage.setItem(
        "balance-pomodoro",
        JSON.stringify({
          mode,
          focusEndsAt,
          breakEndsAt,
          breakReady,
          paused,
          pausedRemainingMs,
          elapsedBeforePauseMs,
          pausedHabitId,
          nextBreakMinutes,
          plan,
          timerPreferences,
          sessionSettings,
        }),
      );
    } catch (error) {
      console.error("Could not save the timer state.", error);
    }
  }, [
    mode,
    focusEndsAt,
    breakEndsAt,
    breakReady,
    paused,
    pausedRemainingMs,
    elapsedBeforePauseMs,
    pausedHabitId,
    nextBreakMinutes,
    plan,
    timerPreferences,
    sessionSettings,
    timerStateRestored,
  ]);

  useEffect(() => {
    if (!running) completedFocus.current = false;

    if (
      !timerStateRestored ||
      !running ||
      !activeFocusEndsAt ||
      now.getTime() < activeFocusEndsAt ||
      completedFocus.current
    ) {
      return;
    }

    completedFocus.current = true;

    const activeSettings = sessionSettings ?? {
      pomodoro_focus_minutes: settings?.pomodoro_focus_minutes ?? 25,
      pomodoro_short_break_minutes: settings?.pomodoro_short_break_minutes ?? 5,
      pomodoro_long_break_minutes: settings?.pomodoro_long_break_minutes ?? 15,
      longBreakAfter: timerPreferences.longBreakAfter,
    };
    const nextCycle = cycles + 1;
    const breakMinutes =
      nextCycle % activeSettings.longBreakAfter === 0
        ? activeSettings.pomodoro_long_break_minutes
        : activeSettings.pomodoro_short_break_minutes;

    timer.mutate(
      { runningId: running.id, endedAt: new Date(activeFocusEndsAt).toISOString() },
      {
        onSuccess: () => {
          setFocusEndsAt(null);
          setPaused(false);
          setPausedRemainingMs(null);
          setElapsedBeforePauseMs(0);
          setPausedHabitId(null);
          setSessionSettings(null);
          setTimerAnnouncement("Focus session complete.");

          const finished = plan ? plan.done + 1 >= plan.target : true;
          setPlan((current) =>
            current && current.done + 1 < current.target
              ? { ...current, done: current.done + 1 }
              : null,
          );

          setNextBreakMinutes(breakMinutes);
          setBreakReady(true);

          toast.success(finished && plan ? "Pomodoro plan complete" : "Focus session complete", {
            description: "Take a break or continue when you’re ready.",
          });

          playSound(timerPreferences.workSound);
          if (
            timerPreferences.completionNotifications &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            new Notification("Focus session complete", {
              body: "Take a break or continue when you’re ready.",
            });
          }
        },
        onError: () => {
          completedFocus.current = false;
        },
      },
    );
  }, [
    now,
    running,
    activeFocusEndsAt,
    cycles,
    settings,
    timer,
    plan,
    timerStateRestored,
    sessionSettings,
    timerPreferences,
  ]);

  useEffect(() => {
    if (runningId) {
      setMode(runningMode === "pomodoro" ? "pomodoro" : "stopwatch");
    }
  }, [runningId, runningMode]);

  useEffect(() => {
    if (breakEndsAt && now.getTime() >= breakEndsAt) {
      setBreakEndsAt(null);
      setTimerAnnouncement("Break complete.");
      toast.success("Break complete", { description: "Ready for another focus session?" });
      playSound(timerPreferences.breakSound);
      if (
        timerPreferences.completionNotifications &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification("Break complete", {
          body: "Ready for another focus session?",
        });
      }
    }
  }, [now, breakEndsAt, timerPreferences.breakSound, timerPreferences.completionNotifications]);

  useEffect(() => {
    if (!runningId || !timerPreferences.chronometerSound) return;
    const interval = window.setInterval(() => playSound("default-beep"), 1000);
    return () => window.clearInterval(interval);
  }, [runningId, timerPreferences.chronometerSound]);

  useEffect(() => {
    if (!running && !breakEndsAt) {
      if (originalTitle.current !== null) {
        document.title = originalTitle.current;
        originalTitle.current = null;
      }
      return;
    }
    if (originalTitle.current === null) originalTitle.current = document.title;
    document.title = `${formattedClock} · ${originalTitle.current}`;
  }, [breakEndsAt, formattedClock, running]);

  useEffect(
    () => () => {
      if (originalTitle.current !== null) document.title = originalTitle.current;
    },
    [],
  );

  const startPomodoro = () => {
    if (!selected) return;
    const duration = settings?.pomodoro_focus_minutes ?? 25;
    setSessionSettings({
      pomodoro_focus_minutes: duration,
      pomodoro_short_break_minutes: settings?.pomodoro_short_break_minutes ?? 5,
      pomodoro_long_break_minutes: settings?.pomodoro_long_break_minutes ?? 15,
      longBreakAfter: timerPreferences.longBreakAfter,
    });
    completedFocus.current = false;
    setBreakReady(false);
    setPaused(false);
    setPausedRemainingMs(null);
    setElapsedBeforePauseMs(0);
    setPausedHabitId(null);

    if (!plan) {
      setPlan({ target: timerPreferences.targetCount, done: 0 });
    }

    setFocusEndsAt(Date.now() + duration * 60000);
    timer.mutate(
      { runningId: null, habitId: selected, mode: "pomodoro" },
      {
        onSuccess: () => setTimerAnnouncement("Pomodoro started."),
        onError: () => setFocusEndsAt(null),
      },
    );
  };

  const startStopwatch = () => {
    if (!selected) return;
    timer.mutate(
      { runningId: null, habitId: selected, mode: "stopwatch" },
      {
        onSuccess: () => {
          setTimerAnnouncement("Stopwatch started.");
          setPaused(false);
          setPausedRemainingMs(null);
          setPausedHabitId(null);
        },
      },
    );
  };

  const pauseTimer = () => {
    if (!running) return;
    const stoppedAt = Date.now();
    const elapsed = Math.max(0, stoppedAt - new Date(running.started_at).getTime());
    const remaining =
      activeFocusEndsAt === null ? null : Math.max(0, activeFocusEndsAt - stoppedAt);
    timer.mutate(
      { runningId: running.id, endedAt: new Date(stoppedAt).toISOString() },
      {
        onSuccess: () => {
          setTimerAnnouncement("Timer paused.");
          setElapsedBeforePauseMs((current) => current + elapsed);
          if (running.mode === "pomodoro") {
            setPausedRemainingMs(remaining ?? 0);
            setFocusEndsAt(null);
          }
          setPausedHabitId(running.habit_id);
          setPaused(true);
        },
      },
    );
  };

  const resumeTimer = () => {
    const resumeHabitId = pausedHabitId ?? selected;
    if (!resumeHabitId) return;
    const resumedFocusEndsAt =
      mode === "pomodoro"
        ? Date.now() + (pausedRemainingMs ?? (settings?.pomodoro_focus_minutes ?? 25) * 60000)
        : null;
    timer.mutate(
      { runningId: null, habitId: resumeHabitId, mode },
      {
        onSuccess: () => {
          setTimerAnnouncement("Timer resumed.");
          setPaused(false);
          setFocusEndsAt(resumedFocusEndsAt);
          setPausedRemainingMs(null);
          setPausedHabitId(null);
        },
      },
    );
  };

  const resetTimer = () => {
    const clearTimerState = () => {
      setTimerAnnouncement("Timer reset.");
      setFocusEndsAt(null);
      setBreakEndsAt(null);
      setBreakReady(false);
      setPaused(false);
      setPausedRemainingMs(null);
      setElapsedBeforePauseMs(0);
      setPausedHabitId(null);
      setSessionSettings(null);
      setPlan(null);
      completedFocus.current = false;
    };

    if (running) {
      timer.mutate(
        { runningId: running.id, endedAt: new Date().toISOString() },
        { onSuccess: clearTimerState },
      );
    } else {
      clearTimerState();
    }
  };

  const locked =
    Boolean(running) ||
    Boolean(breakEndsAt) ||
    breakReady ||
    (mode === "pomodoro" && Boolean(plan));

  const focusTotal =
    (sessionSettings?.pomodoro_focus_minutes ?? settings?.pomodoro_focus_minutes ?? 25) * 60;
  const ringProgress =
    mode === "pomodoro"
      ? running && activeFocusEndsAt
        ? 1 - focusSeconds / focusTotal
        : paused && pausedRemainingMs !== null
          ? 1 - pausedRemainingMs / focusTotal
          : breakEndsAt
            ? 1 - breakSeconds / (nextBreakMinutes * 60)
            : 0
      : running
        ? ((elapsedBeforePauseMs / 60000 + runningMin) % 60) / 60
        : paused
          ? ((elapsedBeforePauseMs / 60000) % 60) / 60
          : 0;
  const R = 92;
  const C = 2 * Math.PI * R;
  return (
    <section className="relative rounded-3xl border bg-surface p-5">
      <div className="mx-auto mb-5 flex max-w-[180px] rounded-full bg-cell p-1">
        {(["stopwatch", "pomodoro"] as const).map((timerMode) => (
          <button
            type="button"
            key={timerMode}
            disabled={locked}
            onClick={() => setMode(timerMode)}
            className={cn(
              "flex-1 rounded-full py-2 text-sm font-semibold transition-colors disabled:opacity-50",
              mode === timerMode ? "bg-background text-primary shadow-sm" : "text-muted-foreground",
            )}
          >
            {timerMode === "pomodoro" ? "Pomodoro" : "Stopwatch"}
          </button>
        ))}
      </div>
      {mode === "pomodoro" && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Open timer settings"
          title="Timer settings"
          onClick={() => setSettingsOpen(true)}
          className="absolute right-3 top-3 z-10 size-10 rounded-full border border-border bg-surface shadow-sm"
        >
          <Settings className="size-4" />
        </Button>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {timerAnnouncement}
      </span>
      <TimerSettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        preferences={timerPreferences}
        onSaveSetting={(key, value) => saveSettings.mutate({ [key]: value })}
        onChangePreference={changeTimerPreference}
        notificationHint={notificationHint}
      />
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle>Reset the timer?</DialogTitle>
            <DialogDescription>
              This stops the timer and discards the current running or paused time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                resetTimer();
                setResetOpen(false);
              }}
            >
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative mx-auto aspect-square w-full max-w-[240px]">
        <svg viewBox="0 0 220 220" className="size-full -rotate-90">
          <circle cx="110" cy="110" r={R} fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="110"
            cy="110"
            r={R}
            fill="none"
            stroke={breakEndsAt ? "var(--accent)" : "var(--primary)"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.max(0, Math.min(1, ringProgress)))}
            className="transition-[stroke-dashoffset] duration-1000"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {mode === "pomodoro"
              ? running
                ? "Focus"
                : breakEndsAt
                  ? "Break"
                  : breakReady
                    ? "Session complete"
                    : "Ready"
              : running
                ? "Tracking"
                : "Today"}
          </p>
          <p
            role="timer"
            aria-live="off"
            aria-label={`${mode === "pomodoro" ? "Pomodoro" : "Stopwatch"} ${mode === "pomodoro" ? formattedClock : formatMinutes(elapsedBeforePauseMs / 60000 + runningMin)} ${mode === "pomodoro" ? "remaining" : "elapsed"}`}
            className="mt-1 font-sans text-4xl font-bold tabular-nums"
          >
            {mode === "pomodoro"
              ? formattedClock
              : formatMinutes(elapsedBeforePauseMs / 60000 + runningMin)}
          </p>
          {running && (
            <p className="mt-1 max-w-[140px] truncate text-xs text-muted-foreground">
              {runningHabit?.name ?? "Unassigned focus"}
            </p>
          )}
          {(running || paused || breakEndsAt) && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Reset timer"
              title="Reset timer"
              onClick={() => setResetOpen(true)}
              className="mt-2 size-8 rounded-full border border-border bg-surface/80"
            >
              <RotateCcw className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {!running && !locked && selectableHabits.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-muted-foreground">
            Optional: link this session to a habit.
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {selectableHabits.map((habit) => {
              const Icon = habitIcon(habit.icon);
              return (
                <button
                  key={habit.id}
                  type="button"
                  onClick={() => onSelectHabit(selected === habit.id ? "" : habit.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors duration-150 active:scale-95",
                    selected === habit.id
                      ? cn(colorBg[habit.color], "text-background")
                      : "bg-cell text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" /> {habit.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === "pomodoro" && plan && !running && breakEndsAt && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Times are locked until all {plan.target} pomodoros are done.
        </p>
      )}

      {mode === "pomodoro" && breakReady && !running && (
        <div className="mt-4 rounded-2xl bg-cell/60 p-4 text-center">
          <p className="text-sm font-semibold">Focus session complete</p>
          <p className="mt-1 text-xs text-muted-foreground">Choose what you’d like to do next.</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setBreakEndsAt(Date.now() + nextBreakMinutes * 60000);
                setBreakReady(false);
                setTimerAnnouncement(`${nextBreakMinutes}-minute break started.`);
              }}
            >
              Take a {nextBreakMinutes}-minute break
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={timer.isPending || (!running && !breakEndsAt && !selected)}
              onClick={startPomodoro}
            >
              Start pomodoro
            </Button>
          </div>
        </div>
      )}

      <Button
        variant={running ? "amber" : "neon"}
        size="lg"
        className="mt-5 w-full bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] active:scale-[0.98] focus-visible:ring-2"
        disabled={timer.isPending}
        onClick={() => {
          if (running) {
            pauseTimer();
          } else if (breakEndsAt) {
            setBreakEndsAt(null);
            setTimerAnnouncement("Break skipped.");
          } else if (paused) {
            resumeTimer();
          } else if (mode === "pomodoro") {
            startPomodoro();
          } else {
            startStopwatch();
          }
        }}
      >
        {running ? <Pause /> : <Play />}
        {mode === "pomodoro"
          ? running
            ? "Pause"
            : breakEndsAt
              ? "Skip break"
              : paused
                ? "Resume"
                : breakReady
                  ? "Start pomodoro"
                  : "Start pomodoro"
          : running
            ? "Pause"
            : paused
              ? "Resume"
              : "Start timer"}
      </Button>

      {!selected && !running && !breakEndsAt && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Select a timed habit before starting a focus session.
        </p>
      )}
    </section>
  );
}
export function SessionList() {
  const { data: sessions = [] } = useSessions();
  const { data: habits = [] } = useHabits();
  const del = useDeleteSession();
  const now = useNow(30000);
  if (!sessions.length) return <p className="text-sm text-muted-foreground">No sessions yet.</p>;
  return (
    <ul className="space-y-2">
      {sessions.slice(0, 30).map((s) => {
        const start = new Date(s.started_at);
        const end = s.ended_at ? new Date(s.ended_at) : now;
        const mins = (end.getTime() - start.getTime()) / 60000;
        const t = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return (
          <li
            key={s.id}
            className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold">
                {habits.find((h) => h.id === s.habit_id)?.name ?? "Unassigned focus"}
              </p>
              <p className="text-xs text-muted-foreground">
                {start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                {" · "}
                {s.mode === "pomodoro" ? "Pomodoro" : "Stopwatch"}
              </p>
              <p className="font-mono text-sm text-muted-foreground">
                {t(start)} – {s.ended_at ? t(end) : "now"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{formatMinutes(mins)}</span>
              <button
                aria-label="Delete session"
                onClick={() => del.mutate(s.id)}
                className="p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function lastDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(dayKey(x));
  }
  return out;
}

export type HabitStatusFilter = "all" | "active" | "paused" | "archived";
export type HabitSortOrder = "oldest" | "newest" | "alphabetical";

const WEEK_STATE_LABELS: Record<DayState, string> = {
  done: "completed",
  missed: "missed",
  pending: "not completed yet",
  future: "upcoming",
  off: "not scheduled",
};

function HabitWeekStrip({
  habitName,
  dayKeys,
  states,
}: {
  habitName: string;
  dayKeys: string[];
  states: DayState[];
}) {
  const scheduledDays = states.filter((state) => state !== "off").length;
  const completedDays = states.filter((state) => state === "done").length;
  const accessibleSummary = dayKeys
    .map((day, index) => {
      const state = states[index];
      return `${new Date(`${day}T12:00:00`).toLocaleDateString([], {
        weekday: "long",
      })}: ${state ? WEEK_STATE_LABELS[state] : "unknown"}`;
    })
    .join(". ");

  return (
    <div
      role="img"
      aria-label={`${habitName}: ${completedDays} of ${scheduledDays} planned days completed this week. ${accessibleSummary}`}
      className="flex items-center justify-between gap-1"
    >
      {dayKeys.map((day, index) => {
        const state = states[index] ?? "off";
        const dateLabel = new Date(`${day}T12:00:00`).toLocaleDateString([], {
          weekday: "short",
        });
        return (
          <span key={day} className="flex min-w-0 flex-col items-center gap-1">
            <span className="text-[13px] leading-4 font-medium text-[var(--text-secondary)]">
              {dateLabel}
            </span>
            {state === "off" ? (
              <span aria-hidden="true" className="text-xs leading-4 text-muted-foreground">
                -
              </span>
            ) : (
              <span
                aria-hidden="true"
                title={`${dateLabel}: ${WEEK_STATE_LABELS[state]}`}
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "missed" && "border-border bg-muted/60 text-muted-foreground",
                  state === "pending" && "border-primary bg-surface",
                  state === "future" && "border-dashed border-border/70 bg-transparent",
                )}
              >
                {state === "done" && <Check className="size-2.5" />}
                {state === "missed" && <span className="text-[10px] leading-none">-</span>}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function HabitList({
  showGrid = true,
  searchTerm = "",
  categoryFilter = "All categories",
  statusFilter = "all",
  sortOrder = "oldest",
  todayOnly = false,
  selectableTimed = false,
  selectedHabitId = "",
  onSelectHabit,
}: {
  showGrid?: boolean;
  searchTerm?: string;
  categoryFilter?: string;
  statusFilter?: HabitStatusFilter;
  sortOrder?: HabitSortOrder;
  todayOnly?: boolean;
  selectableTimed?: boolean;
  selectedHabitId?: string;
  onSelectHabit?: (habitId: string) => void;
}) {
  const now = useNow(30000);
  const {
    data: habits = [],
    error: habitsError,
    isError: hasHabitsError,
    isLoading,
    refetch: refetchHabits,
  } = useHabits();
  const {
    data: logs = [],
    error: logsError,
    isError: hasLogsError,
    refetch: refetchLogs,
  } = useHabitLogs();
  const {
    data: sessions = [],
    error: sessionsError,
    isError: hasSessionsError,
    refetch: refetchSessions,
  } = useSessions();
  const toggle = useToggleLog();
  const del = useDeleteHabit();
  const updateHabit = useUpdateHabit();
  const [showArchived, setShowArchived] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<{
    habitId: string;
    previousDone?: boolean;
    previousCount?: number;
    optimisticCount?: number;
    previousCompletedAt?: string | null;
    message: string;
    key: number;
  } | null>(null);
  const [xpFeedback, setXpFeedback] = useState<{
    habitId: string;
    text: string;
    isNegative: boolean;
    key: number;
  } | null>(null);
  const feedbackKey = useRef(0);
  const today = dayKey(now);
  const days = lastDays(119);
  const weekDays = getWeekDayKeys(now);
  const logsByHabitDay = useMemo(
    () => new Map(logs.map((log) => [`${log.habit_id}|${log.day}`, log.count])),
    [logs],
  );
  const completionTimeByHabitDay = useMemo(
    () => new Map(logs.map((log) => [`${log.habit_id}|${log.day}`, log.completed_at])),
    [logs],
  );
  const done = useMemo(
    () =>
      new Set(
        logs
          .filter((log) => {
            const habit = habits.find((item) => item.id === log.habit_id);
            return habit?.tracking_type !== "count" || log.count >= (habit.daily_goal_count ?? 1);
          })
          .map((log) => `${log.habit_id}|${log.day}`),
      ),
    [logs, habits],
  );
  const daysByHabit = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const log of logs) {
      const habit = habits.find((item) => item.id === log.habit_id);
      if (habit?.tracking_type === "count" && log.count < (habit.daily_goal_count ?? 1)) continue;
      const habitDays = grouped.get(log.habit_id) ?? [];
      habitDays.push(log.day);
      grouped.set(log.habit_id, habitDays);
    }
    return grouped;
  }, [logs, habits]);
  const timeByHabit = useMemo(() => minutesByHabitAndDay(sessions, now), [sessions, now]);
  const scheduledTodayIds = useMemo(
    () => new Set(getTodayHabits(habits, today).map((habit) => habit.id)),
    [habits, today],
  );
  const visibleHabits = habits
    .filter((habit) => {
      const archived = Boolean(habit.archived_at);
      if (todayOnly && !scheduledTodayIds.has(habit.id)) return false;
      if (statusFilter === "archived" ? !archived : archived && !showArchived) return false;
      if (statusFilter === "active" && (archived || habit.is_paused)) return false;
      if (statusFilter === "paused" && (archived || !habit.is_paused)) return false;
      if (categoryFilter !== "All categories" && habit.category !== categoryFilter) return false;
      return habit.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
    })
    .sort((left, right) => {
      if (todayOnly) {
        const leftDone = done.has(`${left.id}|${today}`);
        const rightDone = done.has(`${right.id}|${today}`);
        if (leftDone !== rightDone) return leftDone ? 1 : -1;
      }
      if (sortOrder === "alphabetical") return left.name.localeCompare(right.name);
      const chronological = left.created_at.localeCompare(right.created_at);
      return sortOrder === "newest" ? -chronological : chronological;
    });

  useEffect(() => {
    if (!undoAction) return;
    const timeout = window.setTimeout(() => setUndoAction(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [undoAction]);

  useEffect(() => {
    if (!xpFeedback) return;
    const timeout = window.setTimeout(() => setXpFeedback(null), 600);
    return () => window.clearTimeout(timeout);
  }, [xpFeedback]);

  const showXpFeedback = (
    habitId: string,
    result: { delta: number; totalDelta: number },
    isAwardAttempt: boolean,
  ) => {
    const delta = result.delta || result.totalDelta;
    if (delta !== 0) {
      setXpFeedback({
        habitId,
        text: `${delta > 0 ? "+" : ""}${delta} XP`,
        isNegative: delta < 0,
        key: ++feedbackKey.current,
      });
    } else if (isAwardAttempt && result.totalDelta === 0) {
      setXpFeedback({
        habitId,
        text: "No XP awarded",
        isNegative: false,
        key: ++feedbackKey.current,
      });
    }
  };

  const showOptimisticXpFeedback = (habitId: string) => {
    const habit = habits.find((item) => item.id === habitId);
    if (!habit) return;
    const streak = scheduledStreakStats(daysByHabit.get(habitId) ?? [], today, habit).current + 1;
    const amount = xpRewardsForCompletion(habitId, today, streak, habit.difficulty).reduce(
      (total, reward) => total + reward.amount,
      0,
    );
    setXpFeedback({
      habitId,
      text: `+${amount} XP`,
      isNegative: false,
      key: ++feedbackKey.current,
    });
  };

  const updateCount = (habitId: string, count: number, nextCount: number, goal: number) => {
    const actionKey = ++feedbackKey.current;
    const completesHabit = count < goal && nextCount >= goal;
    setUndoAction({
      habitId,
      previousCount: count,
      optimisticCount: nextCount,
      previousCompletedAt: completionTimeByHabitDay.get(`${habitId}|${today}`) ?? null,
      message: nextCount >= goal ? "Marked done." : "Updated progress.",
      key: actionKey,
    });
    if (completesHabit) showOptimisticXpFeedback(habitId);
    toggle.mutate(
      {
        habit_id: habitId,
        day: today,
        done: false,
        count: nextCount,
        currentCount: count,
        completed_at: completionTimeByHabitDay.get(`${habitId}|${today}`) ?? null,
      },
      {
        onSuccess: (result) => {
          showXpFeedback(habitId, result, count < goal && nextCount >= goal);
        },
        onError: () => {
          setUndoAction((current) => (current?.key === actionKey ? null : current));
          setXpFeedback((current) => (current?.habitId === habitId ? null : current));
        },
      },
    );
  };

  const undoCompletion = () => {
    if (!undoAction) return;
    const action = undoAction;
    setUndoAction(null);
    toggle.mutate({
      habit_id: action.habitId,
      day: today,
      done: action.previousDone ?? false,
      currentCount: action.optimisticCount ?? 0,
      completed_at: action.previousCompletedAt ?? null,
      ...(action.previousCount === undefined ? {} : { count: action.previousCount }),
    });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (hasHabitsError)
    return (
      <DatabaseErrorNotice
        title="Habits could not be loaded"
        error={habitsError}
        onRetry={() => {
          void refetchHabits();
        }}
      />
    );
  if (hasLogsError || hasSessionsError)
    return (
      <DatabaseErrorNotice
        title="Habit history or focus sessions could not be loaded"
        error={logsError ?? sessionsError}
        onRetry={() => {
          void Promise.all([refetchLogs(), refetchSessions()]);
        }}
      />
    );
  if (!habits.length)
    return (
      <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        No habits yet — add your first one.
      </p>
    );

  if (!visibleHabits.length)
    return (
      <div className="space-y-3">
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {statusFilter === "archived"
            ? "No archived habits yet."
            : searchTerm || categoryFilter !== "All categories"
              ? "No habits match these filters."
              : statusFilter === "paused"
                ? "No paused habits."
                : "No habits to show. Add one or view archived habits."}
        </p>
        {showGrid && statusFilter !== "archived" && (
          <button
            type="button"
            onClick={() => setShowArchived((value) => !value)}
            className="w-full text-center text-sm text-primary"
          >
            {showArchived ? "Hide archived habits" : "Show archived habits"}
          </button>
        )}
      </div>
    );

  return (
    <>
      {showGrid && statusFilter !== "archived" && (
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          className="mb-3 min-h-9 rounded-xl px-2 text-sm text-primary hover:bg-primary/5"
        >
          {showArchived ? "Hide archived habits" : "Show archived habits"}
        </button>
      )}
      <ul className={cn("grid gap-4", showGrid && "lg:grid-cols-2")}>
        {visibleHabits.map((h) => {
          const isArchived = Boolean(h.archived_at);
          const inactive = isArchived || h.is_paused || !isHabitScheduledOnDay(h, today);
          const isDone = done.has(`${h.id}|${today}`);
          const minutes = timeByHabit.get(`${h.id}|${today}`) ?? 0;
          const goal = h.daily_goal_minutes ?? 0;
          const streak = scheduledStreakStats(daysByHabit.get(h.id) ?? [], today, h);
          const completedDays = new Set(daysByHabit.get(h.id) ?? []);
          const weekStrip = getWeekStrip(h, completedDays, now);
          const canSelect = selectableTimed && isTimedHabit(h) && !inactive;
          const canExpand = isTimedHabit(h);
          const isSelected = selectedHabitId === h.id;
          const isExpanded = canExpand && expandedHabitId === h.id;
          return (
            <li
              key={h.id}
              onClick={(event) => {
                if (
                  !todayOnly ||
                  !canExpand ||
                  (event.target instanceof HTMLElement && event.target.closest("button"))
                )
                  return;
                setExpandedHabitId(isExpanded ? null : h.id);
              }}
              className={cn(
                "relative min-h-[88px] rounded-2xl border bg-surface p-4 shadow-[var(--shadow-card)] transition-shadow duration-150 hover:shadow-md",
                todayOnly && canExpand && "cursor-pointer",
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              {xpFeedback?.habitId === h.id && (
                <span
                  key={xpFeedback.key}
                  role="status"
                  className={`xp-float pointer-events-none absolute right-3 top-1 z-10 rounded-full border bg-surface px-3 py-1 text-xs font-semibold shadow-md ${
                    xpFeedback.isNegative ? "text-destructive" : "text-primary"
                  }`}
                >
                  {xpFeedback.text}
                </span>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <HabitBadge
                    icon={h.icon}
                    color={h.color}
                    className="size-9 rounded-xl [&>svg]:size-4"
                  />
                  <div className="min-w-0 flex-1">
                    {canExpand ? (
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`habit-details-${h.id}`}
                        onClick={() => setExpandedHabitId(isExpanded ? null : h.id)}
                        className="flex min-h-6 w-full items-center justify-between gap-2 rounded-md text-left"
                      >
                        <span
                          className={cn(
                            "block truncate text-base font-semibold",
                            isDone && "text-muted-foreground",
                          )}
                        >
                          {h.name}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                            isExpanded && "rotate-180",
                          )}
                        />
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "block truncate text-base font-semibold",
                          isDone && "text-muted-foreground",
                        )}
                      >
                        {h.name}
                      </span>
                    )}
                    <span className="block text-[13px] font-medium text-[var(--text-secondary)]">
                      {h.category} ·{" "}
                      {isArchived
                        ? "Archived"
                        : h.is_paused
                          ? "Paused"
                          : `${streak.current} day streak`}
                    </span>
                    {!isArchived && (
                      <div className="mt-2">
                        <HabitWeekStrip habitName={h.name} dayKeys={weekDays} states={weekStrip} />
                      </div>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-0.5",
                    showGrid && "rounded-2xl bg-cell/60 p-1",
                  )}
                >
                  {showGrid && (
                    <>
                      <button
                        type="button"
                        aria-label={`Edit ${h.name}`}
                        onClick={() => setEditingHabit(h)}
                        className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                      >
                        <Pencil className="size-4" />
                      </button>
                      {!isArchived && (
                        <button
                          type="button"
                          aria-label={h.is_paused ? `Resume ${h.name}` : `Pause ${h.name}`}
                          onClick={() =>
                            updateHabit.mutate({ id: h.id, updates: { is_paused: !h.is_paused } })
                          }
                          className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                        >
                          {h.is_paused ? (
                            <PlayCircle className="size-4" />
                          ) : (
                            <Pause className="size-4" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={isArchived ? `Restore ${h.name}` : `Archive ${h.name}`}
                        onClick={() => {
                          if (isArchived) {
                            updateHabit.mutate({ id: h.id, updates: { archived_at: null } });
                          } else if (confirm("Archive this habit? Its history will be kept.")) {
                            del.mutate(h.id);
                          }
                        }}
                        className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface hover:text-destructive"
                      >
                        <Archive className="size-4" />
                      </button>
                    </>
                  )}
                  {h.tracking_type === "count" ? (
                    <div className="flex items-center gap-1.5 rounded-xl bg-cell/70 p-1">
                      <button
                        type="button"
                        aria-label={`Decrease ${h.name} count`}
                        disabled={
                          (toggle.isPending && toggle.variables?.habit_id === h.id) ||
                          inactive ||
                          (logsByHabitDay.get(`${h.id}|${today}`) ?? 0) <= 0
                        }
                        onClick={() => {
                          const count = logsByHabitDay.get(`${h.id}|${today}`) ?? 0;
                          updateCount(h.id, count, count - 1, h.daily_goal_count);
                        }}
                        className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-background active:scale-95 disabled:opacity-40"
                      >
                        −
                      </button>
                      <span
                        aria-label={`${logsByHabitDay.get(`${h.id}|${today}`) ?? 0} of ${h.daily_goal_count} completed`}
                        className={cn(
                          "min-w-10 text-center font-mono text-sm font-semibold",
                          isDone && "text-primary",
                        )}
                      >
                        {logsByHabitDay.get(`${h.id}|${today}`) ?? 0}/{h.daily_goal_count}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${h.name} count`}
                        disabled={
                          (toggle.isPending && toggle.variables?.habit_id === h.id) ||
                          inactive ||
                          (logsByHabitDay.get(`${h.id}|${today}`) ?? 0) >= 999
                        }
                        onClick={() => {
                          const count = logsByHabitDay.get(`${h.id}|${today}`) ?? 0;
                          updateCount(h.id, count, count + 1, h.daily_goal_count);
                        }}
                        className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-150 hover:bg-primary/20 active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Mark ${h.name} ${isDone ? "not done" : "done"}`}
                      aria-pressed={isDone}
                      disabled={
                        (toggle.isPending && toggle.variables?.habit_id === h.id) || inactive
                      }
                      onClick={() => {
                        if (!isDone && typeof navigator !== "undefined") navigator.vibrate?.(15);
                        const actionKey = ++feedbackKey.current;
                        setUndoAction({
                          habitId: h.id,
                          previousDone: isDone,
                          previousCompletedAt:
                            completionTimeByHabitDay.get(`${h.id}|${today}`) ?? null,
                          message: isDone ? "Marked not done." : "Marked done.",
                          key: actionKey,
                        });
                        if (!isDone) showOptimisticXpFeedback(h.id);
                        toggle.mutate(
                          {
                            habit_id: h.id,
                            day: today,
                            done: isDone,
                            completed_at: completionTimeByHabitDay.get(`${h.id}|${today}`) ?? null,
                          },
                          {
                            onSuccess: (result) => showXpFeedback(h.id, result, !isDone),
                            onError: () => {
                              setUndoAction((current) =>
                                current?.key === actionKey ? null : current,
                              );
                              setXpFeedback((current) =>
                                current?.habitId === h.id ? null : current,
                              );
                            },
                          },
                        );
                      }}
                      className="group flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 active:scale-[0.92] disabled:cursor-not-allowed"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-7 items-center justify-center rounded-[9px] border-[1.5px] transition-colors duration-150",
                          isDone
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-[var(--check-empty-border)] bg-transparent text-transparent group-hover:border-primary group-focus-visible:border-primary",
                        )}
                      >
                        {isDone && <Check className="habit-check-mark size-4" />}
                      </span>
                    </button>
                  )}
                </div>
              </div>
              <div
                id={`habit-details-${h.id}`}
                aria-hidden={!isExpanded}
                className={cn(
                  "overflow-hidden transition-[max-height,opacity,margin,padding,border-width] duration-[180ms] motion-reduce:transition-none",
                  isExpanded
                    ? "mt-3 max-h-[500px] border-t border-border/70 pt-3 opacity-100"
                    : "m-0 max-h-0 border-0 p-0 opacity-0",
                )}
              >
                {h.description && (
                  <p className="mb-3 text-sm text-[var(--text-secondary)]">{h.description}</p>
                )}
                {isTimedHabit(h) && !isArchived && goal > 0 && (
                  <div className="mb-3">
                    <div className="mb-1.5 flex justify-between text-sm text-[var(--text-secondary)]">
                      <span>Today&apos;s focus goal</span>
                      <span>
                        {formatMinutes(minutes)} / {formatMinutes(goal)}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${h.name} time goal`}
                      aria-valuenow={Math.min(100, Math.round((minutes / goal) * 100))}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-2 overflow-hidden rounded-full bg-cell"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-200"
                        style={{ width: `${Math.min(100, (minutes / goal) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {canSelect && (
                  <button
                    type="button"
                    tabIndex={isExpanded ? 0 : -1}
                    aria-pressed={isSelected}
                    onClick={() => onSelectHabit?.(isSelected ? "" : h.id)}
                    className="min-h-11 rounded-xl bg-primary/10 px-3 text-sm font-semibold text-primary hover:bg-primary/15"
                  >
                    {isSelected ? "Selected for focus" : "Select for focus"}
                  </button>
                )}
              </div>
              {showGrid && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">90-day progress</span>
                    <span>
                      {days.slice(-90).filter((day) => done.has(`${h.id}|${day}`)).length}/90 days
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${h.name}: 90-day completion history in chronological order, oldest first`}
                    className="grid w-full grid-cols-[repeat(30,minmax(0,1fr))] gap-1"
                  >
                    {days.slice(-90).map((d) => (
                      <span
                        key={d}
                        title={d}
                        aria-label={`${h.name} ${d}${done.has(`${h.id}|${d}`) ? " completed" : ""}`}
                        className={cn(
                          "aspect-square min-w-0 rounded-[3px] transition-colors",
                          done.has(`${h.id}|${d}`) ? colorBg[h.color] : "bg-cell/70",
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {undoAction && (
        <div
          key={undoAction.key}
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-50 flex min-h-12 w-[min(92vw,26rem)] -translate-x-1/2 items-center justify-between gap-3 rounded-xl bg-foreground px-4 py-2 text-sm text-background shadow-lg lg:bottom-6"
        >
          <span>{undoAction.message}</span>
          <button
            type="button"
            onClick={undoCompletion}
            className="min-h-11 rounded-lg px-3 font-semibold text-primary-foreground underline underline-offset-4"
          >
            Undo
          </button>
        </div>
      )}
      <HabitFormDialog
        habit={editingHabit}
        open={Boolean(editingHabit)}
        onOpenChange={(open) => {
          if (!open) setEditingHabit(null);
        }}
      />
    </>
  );
}

export function HabitBadge({
  icon,
  color,
  className,
}: {
  icon?: string | null;
  color: string;
  className?: string;
}) {
  const Icon = habitIcon(icon);
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-2xl text-background",
        colorBg[color],
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
