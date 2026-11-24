import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { RoundStepperButton } from "@/components/timer-settings-panel";
import { HABIT_COLORS, colorBg, useAddHabit, useUpdateHabit } from "@/lib/data";
import {
  HABIT_CATEGORIES,
  HABIT_ICONS,
  HABIT_ICON_GROUPS,
  HABIT_ICON_LABELS,
  habitIcon,
} from "@/lib/habit-meta";
import { isTimedHabit } from "@/lib/today";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Habit = Database["public"]["Tables"]["habits"]["Row"];
type HabitType = "yesno" | "timed";
type DurationMode = "none" | "days" | "dates";

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAfterDays(startDate: string, days: number): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days - 1);
  return date.toISOString().slice(0, 10);
}

function inclusiveDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86400000) + 1;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORY_ICON_KEYS: Record<string, keyof typeof HABIT_ICONS> = {
  Health: "heart",
  Fitness: "dumbbell",
  Workout: "dumbbell",
  Mind: "brain",
  Learning: "book",
  Reading: "book",
  Hydration: "droplets",
  Work: "briefcase",
  Creative: "palette",
  Finance: "piggy",
  Social: "users",
};
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("Health");
  const [icon, setIcon] = useState("dumbbell");
  const [color, setColor] = useState<string>("#219B70");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [durationMode, setDurationMode] = useState<DurationMode>("none");
  const [startDate, setStartDate] = useState(() => localDateKey());
  const [endDate, setEndDate] = useState("");
  const [durationDays, setDurationDays] = useState("30");
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
  const CategoryIcon = HABIT_ICONS[CATEGORY_ICON_KEYS[category] ?? "sparkles"]!;

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
    submitLockRef.current = false;
    if (habit) {
      setName(habit.name);
      setDescription(habit.description);
      setCategory(habit.category);
      setIcon(habit.icon);
      setColor(habit.color);
      setDays(habit.schedule_days);
      setStartDate(habit.start_date ?? habit.created_at.slice(0, 10));
      setEndDate(habit.end_date ?? "");
      setDurationMode(habit.end_date ? "dates" : "none");
      setDurationDays(
        habit.end_date
          ? String(
              inclusiveDaysBetween(
                habit.start_date ?? habit.created_at.slice(0, 10),
                habit.end_date,
              ),
            )
          : "30",
      );
      setType(isTimedHabit(habit) ? "timed" : "yesno");
      setGoalHours(String(Math.floor(habit.daily_goal_minutes / 60)));
      setGoalMinutes(String(habit.daily_goal_minutes % 60));
      setCountGoal(habit.daily_goal_count);
      setDifficulty(
        (["easy", "medium", "hard"].includes(habit.difficulty) ? habit.difficulty : "medium") as
          "easy" | "medium" | "hard",
      );
      setReminderEnabled(habit.reminder_enabled);
      setReminderTime(habit.reminder_time);
      setTourStep(null);
    } else {
      setName("");
      setDescription("");
      setCategory("Health");
      setIcon("dumbbell");
      setColor("#219B70");
      setDays([0, 1, 2, 3, 4, 5, 6]);
      setDurationMode("none");
      setStartDate(localDateKey());
      setEndDate("");
      setDurationDays("30");
      setType("yesno");
      setGoalHours("0");
      setGoalMinutes("30");
      setCountGoal(1);
      setDifficulty("medium");
      setReminderEnabled(false);
      setReminderTime("09:00");
      setNameError("");
      setGoalError("");
      setLengthError("");
      setTourStep(localStorage.getItem("balance-habit-form-tour-seen") === "true" ? null : 0);
    }
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
    const daysValue = Number(durationDays);
    const nextLengthError = !startDate
      ? "Choose a start date."
      : durationMode === "days" && (!Number.isInteger(daysValue) || daysValue < 1 || !endDate)
        ? "Enter a whole number of days, at least 1."
        : durationMode !== "none" && (!endDate || endDate < startDate)
          ? "End date cannot be before the start date."
          : "";
    setNameError(nextNameError);
    setGoalError(nextGoalError);
    setLengthError(nextLengthError);
    if (nextNameError || nextGoalError || nextLengthError) return;
    submitLockRef.current = true;

    const scheduleDays = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
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
      end_date: durationMode === "none" ? null : endDate,
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
        if (!nextOpen && tourStep !== null) dismissTour();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        ref={dialogContentRef}
        className="max-h-[90dvh] overflow-y-auto sm:rounded-3xl"
      >
        {iconScreenOpen ? (
          <div>
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
            <div className="mt-4 space-y-3">
              {HABIT_ICON_GROUPS.map((group) => (
                <section key={group.title}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">{group.title}</h3>
                  <div className="grid grid-cols-6 gap-2">
                    {group.icons.map((iconName) => {
                      const Icon = HABIT_ICONS[iconName]!;
                      const selected = icon === iconName;
                      const label = HABIT_ICON_LABELS[iconName] ?? iconName;
                      return (
                        <button
                          key={iconName}
                          type="button"
                          title={label}
                          aria-label={label}
                          aria-pressed={selected}
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
            <form className="space-y-4" onSubmit={submit} noValidate>
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
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day, index) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={days.includes(index)}
                      onClick={() =>
                        setDays((current) =>
                          current.includes(index)
                            ? current.filter((value) => value !== index)
                            : [...current, index].sort(),
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
                {days.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No days selected means every day.
                  </p>
                )}
              </fieldset>

              <fieldset className="space-y-3 rounded-2xl border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">
                  How long?
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["none", "No end date"],
                      ["days", "Number of days"],
                      ["dates", "Pick dates"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={durationMode === value}
                      onClick={() => {
                        setDurationMode(value);
                        setLengthError("");
                        if (value === "days" && startDate) {
                          const count = Number(durationDays);
                          if (Number.isInteger(count) && count >= 1) {
                            setEndDate(dateAfterDays(startDate, count));
                          }
                        }
                      }}
                      className={cn(
                        "min-h-10 rounded-xl px-2 text-xs font-semibold sm:text-sm",
                        durationMode === value
                          ? "bg-primary text-primary-foreground"
                          : "bg-cell text-muted-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-medium text-muted-foreground">
                  Start date
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      const next = event.target.value;
                      setStartDate(next);
                      setLengthError("");
                      const count = Number(durationDays);
                      if (
                        durationMode === "days" &&
                        next &&
                        Number.isInteger(count) &&
                        count >= 1
                      ) {
                        setEndDate(dateAfterDays(next, count));
                      }
                    }}
                    aria-label="Habit start date"
                    className="mt-1 h-10 rounded-xl bg-cell"
                  />
                </label>
                {durationMode === "days" && (
                  <label className="block text-xs font-medium text-muted-foreground">
                    Number of days
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={durationDays}
                      onChange={(event) => {
                        const next = event.target.value;
                        setDurationDays(next);
                        setLengthError("");
                        const count = Number(next);
                        if (startDate && Number.isInteger(count) && count >= 1) {
                          setEndDate(dateAfterDays(startDate, count));
                        }
                      }}
                      aria-label="Number of days"
                      aria-invalid={Boolean(lengthError)}
                      className="mt-1 h-10 rounded-xl bg-cell"
                    />
                  </label>
                )}
                {durationMode !== "none" && (
                  <label className="block text-xs font-medium text-muted-foreground">
                    End date
                    <Input
                      type="date"
                      min={startDate}
                      value={endDate}
                      onChange={(event) => {
                        const next = event.target.value;
                        setEndDate(next);
                        setLengthError("");
                        if (startDate && next && next >= startDate) {
                          setDurationDays(String(inclusiveDaysBetween(startDate, next)));
                        }
                      }}
                      aria-label="Habit end date"
                      aria-invalid={Boolean(lengthError)}
                      className="mt-1 h-10 rounded-xl bg-cell"
                    />
                    {durationMode === "days" && endDate && (
                      <span className="mt-1 block text-muted-foreground">
                        Ends {new Date(`${endDate}T12:00:00`).toLocaleDateString()}
                      </span>
                    )}
                  </label>
                )}
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
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="text-xs text-muted-foreground">
                Category
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1 h-11 w-full rounded-xl border bg-cell text-sm text-foreground">
                    <span className="flex min-w-0 items-center gap-2">
                      <CategoryIcon className="size-4 shrink-0 text-primary" />
                      <span className="truncate">{category}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl bg-surface p-1 shadow-lg">
                    {HABIT_CATEGORIES.map((item) => {
                      const Icon = HABIT_ICONS[CATEGORY_ICON_KEYS[item] ?? "sparkles"]!;
                      return (
                        <SelectItem
                          key={item}
                          value={item}
                          className="rounded-xl py-2 focus:bg-primary/10 focus:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-semibold data-[state=checked]:text-primary"
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="size-4" />
                            {item}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="text-xs text-muted-foreground">
                Icon
                <button
                  type="button"
                  aria-label="Choose habit icon"
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
                Color
                <div className="mt-2 grid grid-cols-6 justify-items-center gap-y-3">
                  {HABIT_COLORS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`Choose ${value} color`}
                      aria-pressed={color === value}
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
              <div className="flex items-center gap-2 rounded-xl border bg-cell/40 p-3">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl text-background",
                    colorBg[color],
                  )}
                >
                  <SelectedIcon className="size-5" />
                </span>
                <span className="text-sm font-medium">{name.trim() || "Habit preview"}</span>
              </div>

              <label className="block text-xs font-medium text-muted-foreground">
                Purpose or note
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Purpose or note"
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

              <Button type="submit" className="w-full" disabled={isPending}>
                {habit ? <Check /> : <Plus />}
                {habit ? "Save habit" : "Create habit"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
