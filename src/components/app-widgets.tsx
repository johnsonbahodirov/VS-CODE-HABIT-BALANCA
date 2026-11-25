import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Check,
  Trash2,
  Timer as TimerIcon,
  Pencil,
  Pause,
  PlayCircle,
  RotateCcw,
  Settings,
  ChevronDown,
  MoreHorizontal,
  Flame,
  Plus,
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
  useSkipHabitDay,
  DEFAULT_SETTINGS,
  type AppSettings,
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
  getTimedHabitCompletionCandidates,
  isHabitSkippedOnDay,
  isTimedHabit,
} from "@/lib/today";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { HabitCardContent } from "@/components/habit-card-content";
import {
  TimerSettingsPanel,
  type TimerPreferences,
  type TimerSettingKey,
} from "@/components/timer-settings-panel";
import { playSound } from "@/lib/sounds";
import { playOptionalSound, vibrate } from "@/lib/haptics";
import { COPY } from "@/lib/strings";
import { showUndoToast } from "@/lib/feedback";
import { dismissUndoToast } from "@/lib/feedback";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  hapticsEnabled: false,
  soundEnabled: false,
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
  const [localSettings, setLocalSettings] = useState<Partial<AppSettings>>({});
  const settingSaveTimers = useRef<Partial<Record<TimerSettingKey, number>>>({});
  const [sessionSettings, setSessionSettings] = useState<PomodoroSettingsSnapshot | null>(null);
  const originalTitle = useRef<string | null>(null);
  const completedFocus = useRef(false);
  const [plan, setPlan] = useState<{ target: number; done: number } | null>(null);
  const timerSettings = { ...DEFAULT_SETTINGS, ...settings, ...localSettings };

  const running = sessions.find((session) => !session.ended_at);
  const runningId = running?.id;
  const runningMode = running?.mode;
  const selectableHabits = habits.filter(
    (habit) => isTimedHabit(habit) && !habit.is_paused && isHabitScheduledOnDay(habit, dayKey(now)),
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
      ? new Date(running.started_at).getTime() + timerSettings.pomodoro_focus_minutes * 60000
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
              : timerSettings.pomodoro_focus_minutes * 60
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

  useEffect(
    () => () => {
      for (const timeout of Object.values(settingSaveTimers.current)) {
        if (timeout !== undefined) window.clearTimeout(timeout);
      }
    },
    [],
  );

  useEffect(() => {
    setLocalSettings((current) => {
      const next = { ...current };
      for (const key of Object.keys(current) as TimerSettingKey[]) {
        if (settings?.[key] === current[key]) delete next[key];
      }
      return next;
    });
  }, [settings]);

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
      pomodoro_focus_minutes: timerSettings.pomodoro_focus_minutes,
      pomodoro_short_break_minutes: timerSettings.pomodoro_short_break_minutes,
      pomodoro_long_break_minutes: timerSettings.pomodoro_long_break_minutes,
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
          vibrate([200, 100, 200]);
          playOptionalSound("timer-finish");
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
    timerSettings.pomodoro_focus_minutes,
    timerSettings.pomodoro_short_break_minutes,
    timerSettings.pomodoro_long_break_minutes,
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
    const duration = timerSettings.pomodoro_focus_minutes;
    setSessionSettings({
      pomodoro_focus_minutes: duration,
      pomodoro_short_break_minutes: timerSettings.pomodoro_short_break_minutes,
      pomodoro_long_break_minutes: timerSettings.pomodoro_long_break_minutes,
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
        ? Date.now() + (pausedRemainingMs ?? timerSettings.pomodoro_focus_minutes * 60000)
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

  const changeTimerSetting = (key: TimerSettingKey, value: number) => {
    setLocalSettings((current) => ({ ...current, [key]: value }));
    const pending = settingSaveTimers.current[key];
    if (pending !== undefined) window.clearTimeout(pending);
    settingSaveTimers.current[key] = window.setTimeout(() => {
      delete settingSaveTimers.current[key];
      saveSettings.mutate(
        { [key]: value },
        {
          onError: () => {
            setLocalSettings((current) => {
              const next = { ...current };
              delete next[key];
              return next;
            });
          },
        },
      );
    }, 400);
  };

  const focusTotal =
    (sessionSettings?.pomodoro_focus_minutes ?? timerSettings.pomodoro_focus_minutes) * 60;
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
        settings={timerSettings}
        preferences={timerPreferences}
        onSaveSetting={changeTimerSetting}
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

export type HabitStatusFilter = "active" | "paused";

function HabitWeekHeader() {
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_8.5rem] items-center gap-3 px-3">
      <span />
      <div className="grid w-full max-w-[140px] grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
        {COPY.habits.weekdays.map((full, index) => (
          <span key={`${full}-${index}`} aria-label={full}>
            <span className="hidden min-[400px]:inline">{full}</span>
            <span className="min-[400px]:hidden">{COPY.habits.weekdayInitials[index]}</span>
          </span>
        ))}
      </div>
      <span />
    </div>
  );
}

export function HabitList({
  showGrid = true,
  statusFilter = "active",
  todayOnly = false,
  selectableTimed = false,
  selectedHabitId = "",
  onSelectHabit,
  onCreateHabit,
}: {
  showGrid?: boolean;
  statusFilter?: HabitStatusFilter;
  todayOnly?: boolean;
  selectableTimed?: boolean;
  selectedHabitId?: string;
  onSelectHabit?: (habitId: string) => void;
  onCreateHabit?: () => void;
}) {
  const now = useNow(1000);
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
    isLoading: isLogsLoading,
    refetch: refetchLogs,
  } = useHabitLogs();
  const {
    data: sessions = [],
    error: sessionsError,
    isError: hasSessionsError,
    isLoading: isSessionsLoading,
    refetch: refetchSessions,
  } = useSessions();
  const toggle = useToggleLog();
  const skipDay = useSkipHabitDay();
  const del = useDeleteHabit();
  const updateHabit = useUpdateHabit();
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);
  const [deletingHabitId, setDeletingHabitId] = useState<string | null>(null);
  const expandedHabitId = useRef<string | null>(null);
  const reorderElements = useRef(new Map<string, HTMLLIElement>());
  const previousCardTops = useRef(new Map<string, number>());
  const animateNextReorder = useRef(false);
  const reorderFrame = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [undoAction, setUndoAction] = useState<{
    habitId: string;
    previousDone?: boolean;
    previousCount?: number;
    optimisticCount?: number;
    previousCompletedAt?: string | null;
    skipped?: boolean;
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
  const toggleLocks = useRef(new Set<string>());
  const autoCompletionAttempts = useRef(new Set<string>());
  const touchStarts = useRef(new Map<string, { x: number; y: number; time: number }>());
  const suppressTouchClick = useRef(false);
  const today = dayKey(now);
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

  const holdCompletedCard = (habitId: string) => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      animateNextReorder.current = true;
  };

  const cancelHeldCompletion = (_habitId: string) => {
    animateNextReorder.current = false;
  };

  const toggleExpandedHabit = (habitId: string) => {
    const previousId = expandedHabitId.current;
    const nextId = previousId === habitId ? null : habitId;
    if (previousId) {
      const previousCard = reorderElements.current.get(previousId);
      previousCard?.querySelector("[data-habit-details]")?.setAttribute("data-open", "false");
      previousCard?.querySelector("[data-habit-details]")?.setAttribute("aria-hidden", "true");
      previousCard
        ?.querySelector<HTMLButtonElement>("[data-habit-expander]")
        ?.setAttribute("aria-expanded", "false");
    }
    expandedHabitId.current = nextId;
    if (nextId) {
      const nextCard = reorderElements.current.get(nextId);
      nextCard?.querySelector("[data-habit-details]")?.setAttribute("data-open", "true");
      nextCard?.querySelector("[data-habit-details]")?.setAttribute("aria-hidden", "false");
      nextCard
        ?.querySelector<HTMLButtonElement>("[data-habit-expander]")
        ?.setAttribute("aria-expanded", "true");
    }
  };

  const visibleHabits = useMemo(
    () =>
      habits
        .filter((habit) => {
          if (todayOnly && !scheduledTodayIds.has(habit.id)) return false;
          if (statusFilter === "active" && habit.is_paused) return false;
          if (statusFilter === "paused" && !habit.is_paused) return false;
          return true;
        })
        .sort((left, right) => {
          if (todayOnly) {
            const rank = (habit: Habit) => {
              if (isHabitSkippedOnDay(habit, today) && !done.has(`${habit.id}|${today}`)) return 2;
              return done.has(`${habit.id}|${today}`) ? 1 : 0;
            };
            const difference = rank(left) - rank(right);
            if (difference) return difference;
          }
          return left.created_at.localeCompare(right.created_at);
        }),
    [done, habits, scheduledTodayIds, statusFilter, today, todayOnly],
  );

  useLayoutEffect(() => {
    const currentTops = new Map<string, number>();
    for (const [id, element] of reorderElements.current) {
      currentTops.set(id, element.getBoundingClientRect().top);
    }

    if (animateNextReorder.current) {
      animateNextReorder.current = false;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion) {
        for (const [id, element] of reorderElements.current) {
          const previousTop = previousCardTops.current.get(id);
          const currentTop = currentTops.get(id);
          if (previousTop === undefined || currentTop === undefined || previousTop === currentTop)
            continue;
          element.style.transition = "none";
          element.style.transform = `translateY(${previousTop - currentTop}px)`;
        }
        void listRef.current?.offsetHeight;
        if (reorderFrame.current !== null) window.cancelAnimationFrame(reorderFrame.current);
        reorderFrame.current = window.requestAnimationFrame(() => {
          for (const element of reorderElements.current.values()) {
            if (!element.style.transform) continue;
            element.style.transition = "transform 200ms ease-out";
            element.style.transform = "translateY(0)";
            element.addEventListener(
              "transitionend",
              () => {
                element.style.removeProperty("transition");
                element.style.removeProperty("transform");
              },
              { once: true },
            );
          }
          reorderFrame.current = null;
        });
      }
    }

    previousCardTops.current = currentTops;
  }, [visibleHabits]);

  useEffect(
    () => () => {
      if (reorderFrame.current !== null) window.cancelAnimationFrame(reorderFrame.current);
    },
    [],
  );

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

  const toggleHabitCompletion = (habit: Habit, isDone: boolean) => {
    const habitId = habit.id;
    if (toggleLocks.current.has(habitId)) return;
    toggleLocks.current.add(habitId);

    const toggleLog = (currentlyDone: boolean) => {
      if (currentlyDone) cancelHeldCompletion(habitId);
      else holdCompletedCard(habitId);
      vibrate(10);
      const actionKey = ++feedbackKey.current;
      const action = {
        habitId,
        previousDone: currentlyDone,
        previousCompletedAt: completionTimeByHabitDay.get(`${habitId}|${today}`) ?? null,
        message: currentlyDone ? "Marked not done." : COPY.toast.completed,
        key: actionKey,
      };

      setUndoAction(currentlyDone ? null : action);
      if (currentlyDone) dismissUndoToast();
      else {
        playOptionalSound("habit-complete");
        showOptimisticXpFeedback(habitId);
        showUndoToast(COPY.toast.completed, () => undoCompletion(action));
      }

      toggle.mutate(
        {
          habit_id: habitId,
          day: today,
          done: currentlyDone,
          completed_at: completionTimeByHabitDay.get(`${habitId}|${today}`) ?? null,
        },
        {
          onSuccess: (result) => {
            toggleLocks.current.delete(habitId);
            showXpFeedback(habitId, result, !currentlyDone);
          },
          onError: () => {
            toggleLocks.current.delete(habitId);
            if (!currentlyDone) {
              cancelHeldCompletion(habitId);
              dismissUndoToast();
              setUndoAction((current) => (current?.key === actionKey ? null : current));
            }
            setXpFeedback((current) => (current?.habitId === habitId ? null : current));
          },
        },
      );
    };

    if (isHabitSkippedOnDay(habit, today)) {
      skipDay.mutate({ habitId, day: today, skip: false }, { onSuccess: () => toggleLog(isDone) });
    } else {
      toggleLog(isDone);
    }
  };

  const toggleHabitCompletionRef = useRef(toggleHabitCompletion);
  toggleHabitCompletionRef.current = toggleHabitCompletion;

  useEffect(() => {
    if (
      isLoading ||
      isLogsLoading ||
      isSessionsLoading ||
      hasHabitsError ||
      hasLogsError ||
      hasSessionsError
    )
      return;
    const candidates = getTimedHabitCompletionCandidates(habits, timeByHabit, done, today);
    for (const habit of candidates) {
      const key = `${habit.id}|${today}`;
      if (autoCompletionAttempts.current.has(key) || toggleLocks.current.has(habit.id)) continue;
      autoCompletionAttempts.current.add(key);
      toggleHabitCompletionRef.current(habit, false);
    }
  }, [
    done,
    habits,
    hasHabitsError,
    hasLogsError,
    hasSessionsError,
    isLoading,
    isLogsLoading,
    isSessionsLoading,
    timeByHabit,
    today,
  ]);

  const skipHabitToday = (habit: Habit) => {
    if (done.has(`${habit.id}|${today}`) || isHabitSkippedOnDay(habit, today)) return;
    if (toggleLocks.current.has(habit.id)) return;
    toggleLocks.current.add(habit.id);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      animateNextReorder.current = true;
    const action = {
      habitId: habit.id,
      previousDone: false,
      previousCompletedAt: null,
      skipped: true,
      message: COPY.toast.skipped,
      key: ++feedbackKey.current,
    };
    setUndoAction(action);
    showUndoToast(COPY.toast.skipped, () => undoCompletion(action));
    skipDay.mutate(
      { habitId: habit.id, day: today, skip: true },
      {
        onSuccess: () => toggleLocks.current.delete(habit.id),
        onError: () => {
          toggleLocks.current.delete(habit.id);
          dismissUndoToast();
          setUndoAction((current) => (current?.key === action.key ? null : current));
        },
      },
    );
  };

  const updateCount = (habitId: string, count: number, nextCount: number, goal: number) => {
    const actionKey = ++feedbackKey.current;
    const completesHabit = count < goal && nextCount >= goal;
    if (completesHabit) holdCompletedCard(habitId);
    if (count >= goal && nextCount < goal) cancelHeldCompletion(habitId);
    setUndoAction({
      habitId,
      previousCount: count,
      optimisticCount: nextCount,
      previousCompletedAt: completionTimeByHabitDay.get(`${habitId}|${today}`) ?? null,
      message: nextCount >= goal ? "Marked done." : "Updated progress.",
      key: actionKey,
    });
    if (completesHabit) showOptimisticXpFeedback(habitId);
    if (completesHabit) {
      showUndoToast(COPY.toast.completed, () =>
        undoCompletion({
          habitId,
          previousCount: count,
          optimisticCount: nextCount,
          previousCompletedAt: completionTimeByHabitDay.get(`${habitId}|${today}`) ?? null,
          message: COPY.toast.completed,
          key: actionKey,
        }),
      );
    }
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
          if (completesHabit) cancelHeldCompletion(habitId);
          setUndoAction((current) => (current?.key === actionKey ? null : current));
          setXpFeedback((current) => (current?.habitId === habitId ? null : current));
        },
      },
    );
  };

  const undoCompletion = (actionOverride?: NonNullable<typeof undoAction>) => {
    const action = actionOverride ?? undoAction;
    if (!action) return;
    cancelHeldCompletion(action.habitId);
    dismissUndoToast();
    setUndoAction((current) => (current?.key === action.key ? null : current));
    if (action.skipped) {
      skipDay.mutate({ habitId: action.habitId, day: today, skip: false });
      return;
    }
    if (!action.previousDone) holdCompletedCard(action.habitId);
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
  if (!habits.length && statusFilter === "active")
    return (
      <div className="rounded-3xl border border-dashed p-8 text-center">
        <HabitBadge icon="sparkles" color="#219B70" className="mx-auto size-12 rounded-2xl" />
        <h3 className="mt-3 text-lg font-semibold">{COPY.habits.firstTitle}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {COPY.habits.emptySubtitle}
        </p>
        {onCreateHabit && (
          <Button type="button" className="mt-4 min-h-11 rounded-2xl" onClick={onCreateHabit}>
            <Plus className="size-4" /> New habit
          </Button>
        )}
      </div>
    );

  if (!visibleHabits.length)
    return (
      <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        {statusFilter === "paused"
          ? "No paused habits"
          : "No active habits yet. Add one when you’re ready."}
      </p>
    );

  const completedCount = visibleHabits.filter((habit) => done.has(`${habit.id}|${today}`)).length;
  const rank = (habit: Habit) => {
    if (isHabitSkippedOnDay(habit, today) && !done.has(`${habit.id}|${today}`)) return 2;
    return done.has(`${habit.id}|${today}`) ? 1 : 0;
  };

  return (
    <>
      <div className={cn(todayOnly && "today-habit-list-scroll")}>
        {todayOnly && <HabitWeekHeader />}
        <ul
          ref={listRef}
          className={cn("grid gap-2", showGrid && "lg:grid-cols-2", todayOnly && "mt-2")}
        >
          {visibleHabits.map((h, index) => {
            const inactive = h.is_paused || !isHabitScheduledOnDay(h, today);
            const isFinished = Boolean(h.end_date && today > h.end_date);
            const isDone = done.has(`${h.id}|${today}`);
            const isSkipped = isHabitSkippedOnDay(h, today) && !isDone;
            const minutes = timeByHabit.get(`${h.id}|${today}`) ?? 0;
            const goal = h.daily_goal_minutes ?? 0;
            const streak = scheduledStreakStats(daysByHabit.get(h.id) ?? [], today, h);
            const completedDays = new Set(daysByHabit.get(h.id) ?? []);
            const weekStrip = getWeekStrip(h, completedDays, now);
            const canSelect = selectableTimed && isTimedHabit(h) && !inactive;
            const canExpand = isTimedHabit(h);
            const isSelected = selectedHabitId === h.id;
            const isExpanded = canExpand && expandedHabitId.current === h.id;
            const xpAmount = xpRewardsForCompletion(
              h.id,
              today,
              streak.current + (isDone ? 0 : 1),
              h.difficulty,
            ).reduce((total, reward) => total + reward.amount, 0);
            const previousRank = index > 0 ? rank(visibleHabits[index - 1]!) : -1;
            return (
              <Fragment key={h.id}>
                {todayOnly && rank(h) === 1 && previousRank !== 1 && completedCount > 0 && (
                  <li className="col-span-full list-none pt-2 text-sm font-semibold text-muted-foreground">
                    {COPY.habits.completed(completedCount)}
                  </li>
                )}
                {todayOnly && rank(h) === 2 && previousRank !== 2 && (
                  <li className="col-span-full list-none pt-2 text-sm font-semibold text-muted-foreground">
                    {COPY.habits.skipped}
                  </li>
                )}
                <li
                  ref={(element) => {
                    if (element) reorderElements.current.set(h.id, element);
                    else reorderElements.current.delete(h.id);
                  }}
                  onTouchStart={(event) => {
                    if (!todayOnly) return;
                    const touch = event.changedTouches[0];
                    if (touch)
                      touchStarts.current.set(h.id, {
                        x: touch.clientX,
                        y: touch.clientY,
                        time: Date.now(),
                      });
                  }}
                  onTouchMove={(event) => {
                    if (!todayOnly) return;
                    const start = touchStarts.current.get(h.id);
                    const touch = event.changedTouches[0];
                    if (!start || !touch) return;
                    const dx = touch.clientX - start.x;
                    const dy = touch.clientY - start.y;
                    const content =
                      event.currentTarget.querySelector<HTMLElement>(".habit-swipe-content");
                    if (!content || Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 8) return;
                    content.style.transition = "none";
                    content.style.transform = `translateX(${Math.max(-120, Math.min(120, dx))}px)`;
                    event.currentTarget.dataset["swipe"] = dx > 0 ? "complete" : "skip";
                  }}
                  onTouchEnd={(event) => {
                    if (!todayOnly) return;
                    const card = event.currentTarget;
                    const start = touchStarts.current.get(h.id);
                    const touch = event.changedTouches[0];
                    touchStarts.current.delete(h.id);
                    if (!start || !touch) return;
                    const dx = touch.clientX - start.x;
                    const dy = touch.clientY - start.y;
                    const duration = Date.now() - start.time;
                    const fastFlick = Math.abs(dx) >= 55 && duration < 220;
                    const content =
                      event.currentTarget.querySelector<HTMLElement>(".habit-swipe-content");
                    if (content) {
                      content.style.transition = "transform 150ms ease-out";
                      content.style.transform = "translateX(0)";
                    }
                    window.setTimeout(() => {
                      delete card.dataset["swipe"];
                    }, 180);
                    if (Math.abs(dy) > Math.abs(dx)) return;
                    if (Math.abs(dx) < event.currentTarget.clientWidth * 0.35 && !fastFlick) return;
                    event.preventDefault();
                    suppressTouchClick.current = true;
                    window.setTimeout(() => {
                      suppressTouchClick.current = false;
                    }, 350);
                    if (dx > 0) toggleHabitCompletion(h, isDone);
                    else skipHabitToday(h);
                  }}
                  onClick={(event) => {
                    if (
                      !todayOnly ||
                      !canExpand ||
                      (event.target instanceof HTMLElement && event.target.closest("button"))
                    )
                      return;
                    toggleExpandedHabit(h.id);
                  }}
                  className={cn(
                    "relative isolate min-h-[80px] overflow-hidden rounded-2xl border bg-surface shadow-[var(--shadow-card)] transition-[transform,opacity] duration-200 ease-out hover:shadow-md motion-reduce:transition-none",
                    todayOnly && canExpand && "cursor-pointer",
                    isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    todayOnly && isDone && "opacity-60",
                    deletingHabitId === h.id && "pointer-events-none scale-[0.98] opacity-0",
                  )}
                  style={{ touchAction: todayOnly ? "pan-y" : undefined }}
                >
                  <span className="habit-swipe-indicator" aria-hidden="true">
                    <span className="habit-swipe-complete">
                      <Check className="size-5" />
                    </span>
                    <span className="habit-swipe-skip">
                      <span className="text-xl leading-none">–</span>
                    </span>
                  </span>
                  <div className="habit-swipe-content relative grid min-h-[80px] grid-cols-[2.25rem_minmax(0,1fr)_8.5rem] items-center gap-3 bg-surface px-3 py-2">
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
                    <HabitCardContent
                      habit={h}
                      streak={streak.current}
                      xpAmount={xpAmount}
                      goal={goal}
                      isTimed={isTimedHabit(h)}
                      isDone={isDone}
                      isFinished={isFinished}
                      canExpand={canExpand}
                      isExpanded={isExpanded}
                      dayKeys={weekDays}
                      weekStates={weekStrip}
                      onToggleExpanded={() => toggleExpandedHabit(h.id)}
                    />
                    <div className="flex items-center justify-end gap-0.5">
                      {canSelect && (
                        <button
                          type="button"
                          aria-label={COPY.habits.timer(h.name)}
                          aria-pressed={isSelected}
                          onClick={() => onSelectHabit?.(isSelected ? "" : h.id)}
                          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-cell hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <TimerIcon className="size-4" />
                        </button>
                      )}
                      {(showGrid || todayOnly) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`${COPY.habits.menu}: ${h.name}`}
                              className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-cell focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <MoreHorizontal className="size-5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onSelect={() => setEditingHabit(h)}>
                              <Pencil /> {COPY.habits.edit}
                            </DropdownMenuItem>
                            {todayOnly && !isDone && !isSkipped && (
                              <DropdownMenuItem onSelect={() => skipHabitToday(h)}>
                                <span aria-hidden="true">–</span> {COPY.habits.skip}
                              </DropdownMenuItem>
                            )}
                            {showGrid && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  updateHabit.mutate({
                                    id: h.id,
                                    updates: { is_paused: !h.is_paused },
                                  })
                                }
                              >
                                {h.is_paused ? <PlayCircle /> : <Pause />}
                                {h.is_paused ? "Resume" : "Pause"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeletingHabit(h)}
                            >
                              <Trash2 /> {COPY.habits.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                          aria-label={COPY.habits.check(h.name, isDone)}
                          aria-pressed={isDone}
                          disabled={
                            (toggle.isPending && toggle.variables?.habit_id === h.id) ||
                            (skipDay.isPending && skipDay.variables?.habitId === h.id) ||
                            inactive ||
                            toggleLocks.current.has(h.id)
                          }
                          onClick={() => {
                            if (suppressTouchClick.current) return;
                            toggleHabitCompletion(h, isDone);
                          }}
                          className={cn(
                            "habit-check-button group flex size-12 shrink-0 items-center justify-center rounded-full bg-cell transition-transform duration-150 active:scale-[0.92] disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-ring",
                            isDone && "habit-check-pop bg-primary text-primary-foreground",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex size-8 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150",
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
                    <div
                      id={`habit-details-${h.id}`}
                      aria-hidden={!isExpanded}
                      data-habit-details
                      data-open={isExpanded}
                      className="habit-details-motion col-span-full"
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="border-t border-border/70 pt-3">
                          {h.description && (
                            <p className="mb-3 text-sm text-[var(--text-secondary)]">
                              {h.description}
                            </p>
                          )}
                          {isTimedHabit(h) && goal > 0 && (
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
                                  className="h-full origin-left scale-x-0 rounded-full bg-primary transition-transform duration-200"
                                  style={{
                                    transform: `scaleX(${Math.min(100, (minutes / goal) * 100) / 100})`,
                                  }}
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
                      </div>
                    </div>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ul>
      </div>
      <HabitFormDialog
        habit={editingHabit}
        open={Boolean(editingHabit)}
        onOpenChange={(open) => {
          if (!open) setEditingHabit(null);
        }}
      />
      <Dialog
        open={Boolean(deletingHabit)}
        onOpenChange={(open) => {
          if (!open && !del.isPending) setDeletingHabit(null);
        }}
      >
        <DialogContent className="max-w-sm sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete this habit?</DialogTitle>
            <DialogDescription>
              Its history will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={del.isPending}
              onClick={() => setDeletingHabit(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={del.isPending || !deletingHabit}
              onClick={() => {
                if (!deletingHabit) return;
                setDeletingHabitId(deletingHabit.id);
                del.mutate(deletingHabit.id, {
                  onSuccess: () => {
                    setDeletingHabitId(null);
                    setDeletingHabit(null);
                  },
                  onError: () => setDeletingHabitId(null),
                });
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
