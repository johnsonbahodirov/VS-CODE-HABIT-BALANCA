import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Minus,
  MoreHorizontal,
  Plus,
  Timer,
  Trash2,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RoundStepperButton } from "@/components/timer-settings-panel";
import { HABIT_COLORS, colorBg, useAddHabit, useDeleteHabit, useUpdateHabit } from "@/lib/data";
import { HabitCardContent } from "@/components/habit-card-content";
import {
  HABIT_CATEGORIES,
  HABIT_ICONS,
  HABIT_ICON_GROUPS,
  HABIT_ICON_LABELS,
  habitIcon,
} from "@/lib/habit-meta";
import { getWeekDayKeys, getWeekStrip, isTimedHabit } from "@/lib/today";
import { habitCompletionXp, xpRewardsForCompletion } from "@/lib/gamification";
import {
  getHabitDurationError,
  habitEndDateAfterDays,
  inclusiveHabitDurationDays,
} from "@/lib/habit-duration";
import { COPY } from "@/lib/strings";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Habit = Database["public"]["Tables"]["habits"]["Row"];
type HabitType = "yesno" | "timed";
function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GOAL_PRESETS = [
  ["15m", 15],
  ["30m", 30],
  ["45m", 45],
  ["1h", 60],
  ["2h", 120],
] as const;
export function HabitFormDialog({
  open,
  onOpenChange,
  habit = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habit?: Habit | null;
}) {
  const addHabit = useAddHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("Health");
  const [icon, setIcon] = useState("dumbbell");
  const [color, setColor] = useState<string>("#219B70");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [startDate, setStartDate] = useState(() => localDateKey());
  const [endDate, setEndDate] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [type, setType] = useState<HabitType>("yesno");
  const [goalHours, setGoalHours] = useState("0");
  const [goalMinutes, setGoalMinutes] = useState("30");
  const [countGoal, setCountGoal] = useState(1);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [nameError, setNameError] = useState("");
  const [goalError, setGoalError] = useState("");
  const [lengthError, setLengthError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const initialFormKey = useRef("");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [iconScreenOpen, setIconScreenOpen] = useState(false);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const formScrollPositionRef = useRef(0);
  const submitLockRef = useRef(false);

  const SelectedIcon = habitIcon(icon);
  const totalGoalMinutes = useMemo(
    () => Number(goalHours) * 60 + Number(goalMinutes),
    [goalHours, goalMinutes],
  );
  const isPending = addHabit.isPending || updateHabit.isPending;
  const previewDate = new Date();
  const previewToday = localDateKey(previewDate);
  const previewHabit = {
    id: "habit-preview",
    name: name.trim() || COPY.habits.placeholderName,
    icon,
    color,
    category,
    habit_type: type,
  };
  const previewDayKeys = getWeekDayKeys(previewDate);
  const previewWeekStates = getWeekStrip(
    {
      ...previewHabit,
      frequency: days.length === 7 ? "daily" : "selected_days",
      schedule_days: days,
      start_date: startDate,
      end_date: endDate || null,
      skipped_dates: [],
    },
    new Set(),
    previewDate,
  );
  const previewXpAmount = xpRewardsForCompletion(
    previewHabit.id,
    previewToday,
    1,
    difficulty,
  ).reduce((total, reward) => total + reward.amount, 0);
  const difficultyXpAmount = habitCompletionXp(difficulty);
  const formValues = {
    name,
    description,
    category,
    icon,
    color,
    days,
    durationDays,
    startDate,
    endDate,
    type,
    goalHours,
    goalMinutes,
    countGoal,
    difficulty,
    reminderEnabled,
    reminderTime,
  };
  const isDirty = formReady && JSON.stringify(formValues) !== initialFormKey.current;

  const setGoalTotal = (minutes: number) => {
    const total = Math.max(0, Math.min(1440, minutes));
    setGoalHours(String(Math.floor(total / 60)));
    setGoalMinutes(String(total % 60));
    setGoalError("");
  };

  const adjustGoal = (minutes: number) => {
    const currentHours = Number(goalHours);
    const currentMinutes = Number(goalMinutes);
    setGoalTotal(
      (Number.isFinite(currentHours) ? currentHours : 0) * 60 +
        (Number.isFinite(currentMinutes) ? currentMinutes : 0) +
        minutes,
    );
  };

  useEffect(() => {
    if (!open) return;
    setFormReady(false);
    submitLockRef.current = false;
    const initialStartDate = habit?.start_date ?? habit?.created_at.slice(0, 10) ?? localDateKey();
    const initialEndDate = habit?.end_date ?? "";
    const initialDurationDays =
      habit?.end_date && initialStartDate
        ? String(inclusiveHabitDurationDays(initialStartDate, habit.end_date))
        : "";
    const initialValues = {
      name: habit?.name ?? "",
      description: habit?.description ?? "",
      category: habit?.category ?? "Health",
      icon: habit?.icon ?? "dumbbell",
      color: habit?.color ?? "#219B70",
      days: habit?.schedule_days ?? [0, 1, 2, 3, 4, 5, 6],
      durationDays: initialDurationDays,
      startDate: initialStartDate,
      endDate: initialEndDate,
      type: (habit ? (isTimedHabit(habit) ? "timed" : "yesno") : "yesno") as HabitType,
      goalHours: habit ? String(Math.floor(habit.daily_goal_minutes / 60)) : "0",
      goalMinutes: habit ? String(habit.daily_goal_minutes % 60) : "30",
      countGoal: habit?.daily_goal_count ?? 1,
      difficulty: (habit?.difficulty === "easy" || habit?.difficulty === "hard"
        ? habit.difficulty
        : "medium") as "easy" | "medium" | "hard",
      reminderEnabled: habit?.reminder_enabled ?? false,
      reminderTime: habit?.reminder_time ?? "09:00",
    };
    initialFormKey.current = JSON.stringify(initialValues);
    setName(initialValues.name);
    setDescription(initialValues.description);
    setCategory(initialValues.category);
    setIcon(initialValues.icon);
    setColor(initialValues.color);
    setDays(initialValues.days);
    setStartDate(initialValues.startDate);
    setEndDate(initialValues.endDate);
    setDurationDays(initialValues.durationDays);
    setType(initialValues.type);
    setGoalHours(initialValues.goalHours);
    setGoalMinutes(initialValues.goalMinutes);
    setCountGoal(initialValues.countGoal);
    setDifficulty(initialValues.difficulty);
    setReminderEnabled(initialValues.reminderEnabled);
    setReminderTime(initialValues.reminderTime);
    setNameError("");
    setGoalError("");
    setLengthError("");
    setScheduleError("");
    setTourStep(
      habit || localStorage.getItem("balance-habit-form-tour-seen") === "true" ? null : 0,
    );
    setFormReady(true);
  }, [open, habit]);

  useEffect(() => {
    if (!iconScreenOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIconScreenOpen(false);
        window.requestAnimationFrame(() => {
          if (dialogContentRef.current) {
            dialogContentRef.current.scrollTop = formScrollPositionRef.current;
          }
        });
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [iconScreenOpen]);

  const dismissTour = () => {
    localStorage.setItem("balance-habit-form-tour-seen", "true");
    setTourStep(null);
  };

  const closeForm = () => {
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    if (tourStep !== null) dismissTour();
    onOpenChange(false);
  };

  const chooseSchedule = (nextDays: number[]) => {
    setDays(nextDays);
    setScheduleError(nextDays.length ? "" : COPY.habits.scheduleRequired);
  };

  const handleRadioKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const directions: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    const radios = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ??
        [],
    );
    if (!radios.length) return;
    let nextIndex: number;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = radios.length - 1;
    else {
      const direction = directions[event.key];
      if (direction === undefined) return;
      const currentIndex = radios.indexOf(event.currentTarget);
      nextIndex = (currentIndex + direction + radios.length) % radios.length;
    }
    event.preventDefault();
    const nextRadio = radios[nextIndex];
    if (!nextRadio) return;
    nextRadio.focus();
    nextRadio.click();
  };

  const schedulePresets = [
    { label: COPY.habits.everyDay, value: [0, 1, 2, 3, 4, 5, 6] },
    { label: COPY.habits.weekdaysOnly, value: [1, 2, 3, 4, 5] },
    { label: COPY.habits.weekendsOnly, value: [0, 6] },
  ];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLockRef.current || isPending) return;
    const cleanName = name.trim();
    const nextNameError = cleanName ? "" : "Enter a habit name.";
    const hoursValid =
      goalHours.trim() !== "" &&
      Number.isInteger(Number(goalHours)) &&
      Number(goalHours) >= 0 &&
      Number(goalHours) <= 24;
    const minutesValid =
      goalMinutes.trim() !== "" &&
      Number.isInteger(Number(goalMinutes)) &&
      Number(goalMinutes) >= 0 &&
      Number(goalMinutes) <= 59;
    const nextGoalError =
      type !== "timed"
        ? ""
        : !hoursValid || !minutesValid
          ? "Enter whole hours (0–24) and minutes (0–59)."
          : totalGoalMinutes <= 0
            ? "Timed habits need a daily focus goal greater than 0."
            : totalGoalMinutes > 1440
              ? "Daily focus goal cannot exceed 24 hours."
              : "";
    const durationError = getHabitDurationError(durationDays, startDate, endDate);
    const nextLengthError = durationError ? COPY.habits[durationError] : "";
    const nextScheduleError = days.length ? "" : COPY.habits.scheduleRequired;
    setNameError(nextNameError);
    setGoalError(nextGoalError);
    setLengthError(nextLengthError);
    setScheduleError(nextScheduleError);
    if (nextNameError || nextGoalError || nextLengthError || nextScheduleError) return;
    submitLockRef.current = true;

    const scheduleDays = days;
    const value = {
      name: cleanName,
      description,
      category,
      icon,
      color,
      frequency: scheduleDays.length === 7 ? ("daily" as const) : ("selected_days" as const),
      schedule_days: scheduleDays,
      difficulty,
      reminder_enabled: reminderEnabled,
      reminder_time: reminderTime,
      start_date: startDate,
      end_date: endDate || null,
      habit_type: type,
      tracking_type: habit?.tracking_type === "count" ? ("count" as const) : ("yes_no" as const),
      daily_goal_count: habit?.tracking_type === "count" ? countGoal : 1,
      daily_goal_minutes: type === "timed" ? totalGoalMinutes : 0,
    };

    if (habit) {
      updateHabit.mutate(
        { id: habit.id, updates: value },
        {
          onSuccess: () => {
            submitLockRef.current = false;
            onOpenChange(false);
          },
          onError: () => {
            submitLockRef.current = false;
          },
        },
      );
    } else {
      addHabit.mutate(value, {
        onSuccess: () => {
          submitLockRef.current = false;
          dismissTour();
          onOpenChange(false);
        },
        onError: () => {
          submitLockRef.current = false;
        },
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeForm();
      }}
    >
      <DialogContent
        ref={dialogContentRef}
        className="flex max-h-[90dvh] flex-col overflow-hidden sm:rounded-3xl"
      >
        {iconScreenOpen ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-3 border-b pb-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Back to habit form"
                onClick={() => {
                  setIconScreenOpen(false);
                  window.requestAnimationFrame(() => {
                    if (dialogContentRef.current) {
                      dialogContentRef.current.scrollTop = formScrollPositionRef.current;
                    }
                  });
                }}
                className="size-10 shrink-0 rounded-full"
              >
                <ArrowLeft className="size-5" />
              </Button>
              <DialogTitle className="text-lg">Choose icon</DialogTitle>
            </div>
            <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
              {HABIT_ICON_GROUPS.map((group) => (
                <section key={group.title}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">{group.title}</h3>
                  <div
                    role="radiogroup"
                    aria-label={group.title}
                    className="grid grid-cols-6 gap-2"
                  >
                    {group.icons.map((iconName) => {
                      const Icon = HABIT_ICONS[iconName]!;
                      const selected = icon === iconName;
                      const label = HABIT_ICON_LABELS[iconName] ?? iconName;
                      return (
                        <button
                          key={iconName}
                          type="button"
                          role="radio"
                          title={label}
                          aria-label={label}
                          aria-checked={selected}
                          onKeyDown={handleRadioKeyDown}
                          onClick={() => {
                            setIcon(iconName);
                            setIconScreenOpen(false);
                            window.requestAnimationFrame(() => {
                              if (dialogContentRef.current) {
                                dialogContentRef.current.scrollTop = formScrollPositionRef.current;
                              }
                            });
                          }}
                          className={cn(
                            "flex size-12 items-center justify-center rounded-[14px] bg-[#E5F1E8] text-[#16865F] transition-colors hover:bg-[#D2E8DA] active:scale-95 motion-reduce:transition-none",
                            selected && "bg-[#16865F] text-white hover:bg-[#16865F]",
                          )}
                        >
                          <Icon className="size-[22px]" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{habit ? "Edit habit" : "Create a habit"}</DialogTitle>
            </DialogHeader>
            <form
              className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3 pr-1"
              onSubmit={submit}
              noValidate
            >
              {tourStep !== null && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
                  <div>
                    <p className="text-xs font-semibold text-primary">
                      Habit form · Step {tourStep + 1} of 3
                    </p>
                    <p className="mt-1 text-sm">
                      {
                        [
                          "Name your habit and choose its days.",
                          "Choose Yes/No or set a daily time goal for a Timed habit.",
                          "Set its category, icon, color, and optional details.",
                        ][tourStep]
                      }
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={dismissTour}>
                      Skip
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => (tourStep === 2 ? dismissTour() : setTourStep(tourStep + 1))}
                    >
                      {tourStep === 2 ? "Done" : "Next"}
                    </Button>
                  </div>
                </div>
              )}

              <label className="block text-xs font-medium text-muted-foreground">
                Name
                <Input
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (event.target.value.trim()) setNameError("");
                  }}
                  maxLength={120}
                  aria-invalid={Boolean(nameError)}
                  className="mt-1 h-11 rounded-xl bg-cell"
                />
                {nameError && (
                  <span role="alert" className="mt-1 block text-destructive">
                    {nameError}
                  </span>
                )}
              </label>

              <fieldset>
                <legend className="mb-2 text-xs font-medium text-muted-foreground">
                  Days of the week
                </legend>
                <div className="mb-2 flex flex-wrap gap-2">
                  {schedulePresets.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-pressed={
                        preset.value.every((day) => days.includes(day)) &&
                        days.length === preset.value.length
                      }
                      onClick={() => chooseSchedule(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day, index) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={days.includes(index)}
                      onClick={() =>
                        chooseSchedule(
                          days.includes(index)
                            ? days.filter((value) => value !== index)
                            : [...days, index].sort(),
                        )
                      }
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium",
                        days.includes(index)
                          ? "bg-primary text-primary-foreground"
                          : "bg-cell text-muted-foreground",
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                {scheduleError && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {scheduleError}
                  </p>
                )}
              </fieldset>

              <fieldset className="space-y-3 rounded-2xl border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Muddat</legend>
                <label className="block text-xs font-medium text-muted-foreground">
                  Start date
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      const next = event.target.value;
                      setStartDate(next);
                      setLengthError("");
                      if (durationDays && next) {
                        const value = Number(durationDays);
                        if (Number.isInteger(value) && value >= 1 && value <= 3650)
                          setEndDate(habitEndDateAfterDays(next, value));
                      } else if (next && endDate && next <= endDate) {
                        setDurationDays(String(inclusiveHabitDurationDays(next, endDate)));
                      }
                    }}
                    aria-label="Habit start date"
                    className="mt-1 h-10 rounded-xl bg-cell"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-muted-foreground">
                    {COPY.habits.durationInDays}
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={3650}
                        step={1}
                        value={durationDays}
                        onChange={(event) => {
                          const next = event.target.value;
                          setDurationDays(next);
                          setLengthError("");
                          const value = Number(next);
                          setEndDate(
                            next && Number.isInteger(value) && value >= 1 && value <= 3650
                              ? habitEndDateAfterDays(startDate, value)
                              : "",
                          );
                        }}
                        aria-label={COPY.habits.durationInDays}
                        aria-invalid={Boolean(lengthError)}
                        className="h-10 rounded-xl bg-cell"
                      />
                      <span className="shrink-0">{COPY.habits.days}</span>
                    </div>
                  </label>
                  <label className="block text-xs font-medium text-muted-foreground">
                    {COPY.habits.endDate}
                    <Input
                      type="date"
                      min={startDate}
                      value={endDate}
                      onChange={(event) => {
                        const next = event.target.value;
                        setEndDate(next);
                        setDurationDays(
                          startDate && next && next >= startDate
                            ? String(inclusiveHabitDurationDays(startDate, next))
                            : "",
                        );
                        setLengthError("");
                      }}
                      aria-label={COPY.habits.endDate}
                      aria-invalid={Boolean(lengthError)}
                      className="mt-1 h-10 rounded-xl bg-cell"
                    />
                  </label>
                </div>
                {lengthError && (
                  <p role="alert" className="text-xs text-destructive">
                    {lengthError}
                  </p>
                )}
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-xs font-medium text-muted-foreground">
                  Habit type
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["yesno", "Yes/No"],
                      ["timed", "Timed"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={type === value}
                      onClick={() => {
                        setType(value);
                        setGoalError("");
                      }}
                      className={cn(
                        "min-h-10 rounded-xl px-3 text-sm font-semibold",
                        type === value ? "bg-primary text-primary-foreground" : "bg-cell",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {type === "timed" && (
                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-muted-foreground">
                    Daily focus goal
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ["Hours", goalHours, setGoalHours, 60, 24],
                        ["Minutes", goalMinutes, setGoalMinutes, 5, 59],
                      ] as const
                    ).map(([label, value, setValue, increment, max]) => (
                      <div key={label} className="text-xs text-muted-foreground">
                        {label}
                        <div className="mt-1 flex h-11 items-center justify-between gap-1 rounded-xl border bg-cell px-1">
                          <RoundStepperButton
                            label={`Decrease daily goal ${label.toLowerCase()}`}
                            disabled={totalGoalMinutes <= 0}
                            onClick={() => adjustGoal(-increment)}
                          >
                            <Minus className="size-5" strokeWidth={2.5} />
                          </RoundStepperButton>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={value}
                            aria-label={`Daily goal ${label.toLowerCase()}`}
                            onChange={(event) => {
                              setValue(event.target.value.replace(/\D/g, ""));
                              setGoalError("");
                            }}
                            className="h-9 min-w-0 border-0 bg-transparent p-0 text-center font-mono text-sm shadow-none focus-visible:ring-0"
                          />
                          <RoundStepperButton
                            label={`Increase daily goal ${label.toLowerCase()}`}
                            disabled={
                              label === "Hours"
                                ? Number(goalHours) >= max
                                : totalGoalMinutes >= 1440
                            }
                            onClick={() => adjustGoal(increment)}
                          >
                            <Plus className="size-5" strokeWidth={2.5} />
                          </RoundStepperButton>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {GOAL_PRESETS.map(([label, minutes]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setGoalTotal(minutes)}
                        className={cn(
                          "rounded-full bg-cell px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
                          totalGoalMinutes === minutes && "bg-primary/10 text-primary",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {goalError && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {goalError}
                    </p>
                  )}
                </fieldset>
              )}

              <fieldset>
                <legend className="mb-2 text-xs font-medium text-muted-foreground">
                  Difficulty
                </legend>
                <p className="mb-2 text-xs text-muted-foreground">
                  {COPY.habits.xpPerCompletion(difficultyXpAmount)}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(["easy", "medium", "hard"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={difficulty === value}
                      onClick={() => setDifficulty(value)}
                      className={cn(
                        "h-10 rounded-full text-sm font-semibold capitalize",
                        difficulty === value
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10 text-[#183D2C]",
                      )}
                    >
                      {COPY.habits.difficultyLabels[value]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-xs font-medium text-muted-foreground">
                  {COPY.habits.category}
                </legend>
                <div
                  role="radiogroup"
                  aria-label={COPY.habits.category}
                  className="flex flex-wrap gap-2"
                >
                  {HABIT_CATEGORIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="radio"
                      aria-checked={category === item}
                      onKeyDown={handleRadioKeyDown}
                      onClick={() => setCategory(item)}
                      className={cn(
                        "rounded-full px-3 py-2 text-xs font-medium",
                        category === item ? "bg-primary text-primary-foreground" : "bg-cell",
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="text-xs text-muted-foreground">
                {COPY.habits.icon}
                <button
                  type="button"
                  aria-label={COPY.habits.icon}
                  onClick={() => {
                    formScrollPositionRef.current = dialogContentRef.current?.scrollTop ?? 0;
                    setIconScreenOpen(true);
                  }}
                  className="mt-1 flex h-11 w-full items-center justify-between rounded-xl border bg-cell px-3 text-sm text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full text-white",
                        colorBg[color] ?? "bg-[#219B70]",
                      )}
                    >
                      <SelectedIcon className="size-4" />
                    </span>
                    <span>{HABIT_ICON_LABELS[icon] ?? icon}</span>
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                {COPY.habits.color}
                <div
                  role="radiogroup"
                  aria-label={COPY.habits.chooseColor}
                  className="mt-2 grid grid-cols-6 justify-items-center gap-y-3"
                >
                  {HABIT_COLORS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-label={`${COPY.habits.chooseColor} ${value}`}
                      aria-checked={color === value}
                      onKeyDown={handleRadioKeyDown}
                      onClick={() => setColor(value)}
                      className={cn(
                        "size-9 rounded-full",
                        colorBg[value],
                        color === value &&
                          "ring-2 ring-[#183D2C] ring-offset-2 ring-offset-surface",
                      )}
                    />
                  ))}
                </div>
              </div>
              <h3 className="text-xs font-medium text-muted-foreground">
                {COPY.habits.previewHeading}
              </h3>
              <div className="overflow-hidden rounded-2xl border bg-surface shadow-sm">
                <div className="grid min-h-[80px] grid-cols-[2.25rem_minmax(0,1fr)_8.5rem] items-center gap-3 bg-surface px-3 py-2">
                  <HabitCardContent
                    habit={previewHabit}
                    streak={0}
                    xpAmount={previewXpAmount}
                    goal={type === "timed" ? totalGoalMinutes : 0}
                    isTimed={type === "timed"}
                    isDone={false}
                    isFinished={Boolean(endDate && previewToday > endDate)}
                    canExpand={type === "timed"}
                    isExpanded={false}
                    dayKeys={previewDayKeys}
                    weekStates={previewWeekStates}
                  />
                  <div className="flex items-center justify-end gap-0.5">
                    {type === "timed" && (
                      <span className="flex size-10 items-center justify-center rounded-full text-muted-foreground">
                        <Timer className="size-4" />
                      </span>
                    )}
                    <span className="flex size-10 items-center justify-center rounded-full text-muted-foreground">
                      <MoreHorizontal className="size-5" />
                    </span>
                    <span className="flex size-12 items-center justify-center rounded-full bg-cell">
                      <span className="size-8 rounded-full border-[1.5px] border-[var(--check-empty-border)]" />
                    </span>
                  </div>
                </div>
                <div id="habit-details-habit-preview" hidden />
              </div>

              <label className="block text-xs font-medium text-muted-foreground">
                {COPY.habits.purpose}
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={COPY.habits.purpose}
                  maxLength={1000}
                  className="mt-1"
                />
              </label>

              {habit?.tracking_type === "count" && (
                <label className="block text-xs text-muted-foreground">
                  Legacy daily count goal
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={countGoal}
                    onChange={(event) =>
                      setCountGoal(Math.max(1, Math.min(999, Number(event.target.value) || 1)))
                    }
                    className="mt-1 bg-cell"
                  />
                </label>
              )}

              <fieldset className="rounded-2xl border bg-cell/40 p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">
                  Habit reminder
                </legend>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Reminder</span>
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(event) => setReminderEnabled(event.target.checked)}
                    className="size-5 accent-primary"
                  />
                </label>
                {reminderEnabled && (
                  <Input
                    type="time"
                    value={reminderTime}
                    aria-label="Habit reminder time"
                    onChange={(event) => setReminderTime(event.target.value)}
                    className="mt-2 w-32 bg-surface"
                  />
                )}
              </fieldset>
              {habit && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 />
                  {COPY.habits.delete}
                </Button>
              )}
              <div className="sticky bottom-0 flex gap-2 border-t bg-background pt-3 pb-[env(safe-area-inset-bottom)]">
                <Button type="button" variant="outline" className="flex-1" onClick={closeForm}>
                  {COPY.habits.cancel}
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {habit ? <Check /> : <Plus />}
                  {habit ? COPY.habits.save : COPY.habits.create}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
      <Dialog
        open={discardOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDiscardOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{COPY.habits.discardTitle}</DialogTitle>
            <DialogDescription>{COPY.habits.discardDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => setDiscardOpen(false)}>
              {COPY.habits.discardStay}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              {COPY.habits.discardLeave}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (!deleteHabit.isPending) setDeleteConfirmOpen(nextOpen);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{COPY.habits.deleteTitle}</DialogTitle>
            <DialogDescription>{COPY.habits.deleteDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={deleteHabit.isPending}
              onClick={() => setDeleteConfirmOpen(false)}
            >
              {COPY.habits.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteHabit.isPending || !habit}
              onClick={() => {
                if (!habit) return;
                deleteHabit.mutate(habit.id, {
                  onSuccess: () => {
                    setDeleteConfirmOpen(false);
                    onOpenChange(false);
                  },
                });
              }}
            >
              {COPY.habits.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
