import { ChevronDown, Flame } from "lucide-react";
import { colorBg } from "@/lib/data";
import { habitIcon } from "@/lib/habit-meta";
import { COPY } from "@/lib/strings";
import { cn } from "@/lib/utils";
import type { DayState } from "@/lib/today";

const WEEK_STATE_LABELS: Record<DayState, string> = {
  done: "completed",
  missed: "missed",
  pending: "not completed yet",
  future: "upcoming",
  off: "not scheduled",
  skipped: "skipped",
};

export function HabitCardContent({
  habit,
  streak,
  xpAmount,
  goal,
  isTimed,
  isDone,
  isFinished,
  canExpand,
  isExpanded,
  dayKeys,
  weekStates,
  onToggleExpanded,
}: {
  habit: {
    id: string;
    name: string;
    icon: string | null;
    color: string;
    category: string;
  };
  streak: number;
  xpAmount: number;
  goal: number;
  isTimed: boolean;
  isDone: boolean;
  isFinished: boolean;
  canExpand: boolean;
  isExpanded: boolean;
  dayKeys: string[];
  weekStates: DayState[];
  onToggleExpanded?: () => void;
}) {
  const Icon = habitIcon(habit.icon);
  const scheduledDays = weekStates.filter((state) => state !== "off").length;
  const completedDays = weekStates.filter((state) => state === "done").length;
  const accessibleSummary = dayKeys
    .map((day, index) => {
      const state = weekStates[index];
      return `${new Date(`${day}T12:00:00`).toLocaleDateString([], {
        weekday: "long",
      })}: ${state ? WEEK_STATE_LABELS[state] : "unknown"}`;
    })
    .join(". ");

  return (
    <>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl text-background",
          colorBg[habit.color] ?? "bg-[#219B70]",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        {canExpand ? (
          <button
            type="button"
            data-habit-expander
            aria-expanded={isExpanded}
            aria-controls={`habit-details-${habit.id}`}
            onClick={onToggleExpanded}
            className="flex min-h-6 w-full items-center justify-between gap-2 rounded-md text-left"
          >
            <span
              className={cn(
                "block truncate text-base font-semibold",
                isDone && "text-muted-foreground",
              )}
            >
              {habit.name}
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
            {habit.name}
          </span>
        )}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] font-medium">
          <Flame aria-hidden="true" className="size-3 shrink-0 text-orange-500" />
          <span className="shrink-0">{streak}</span>
          <span className="max-w-20 truncate rounded-full bg-cell px-2 py-0.5">
            {habit.category}
          </span>
          <span className="shrink-0 text-primary">+{xpAmount} XP</span>
          {isTimed && (
            <span className="shrink-0 text-muted-foreground">{COPY.habits.duration(goal)}</span>
          )}
        </div>
        {isFinished && (
          <span className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Finished
          </span>
        )}
        <div className="mt-1">
          <div
            role="img"
            aria-label={`${habit.name}: ${completedDays} of ${scheduledDays} planned days completed this week. ${accessibleSummary}`}
            className="grid w-full max-w-[140px] grid-cols-7 gap-1"
          >
            {dayKeys.map((day, index) => {
              const state = weekStates[index] ?? "off";
              return (
                <span
                  key={day}
                  aria-hidden="true"
                  title={`${new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "short" })}: ${WEEK_STATE_LABELS[state]}`}
                  className={cn(
                    "mx-auto flex size-3.5 items-center justify-center rounded-full border",
                    state === "done" && "border-primary bg-primary",
                    state === "missed" && "border-destructive/50 bg-destructive/10",
                    state === "pending" && "border-primary bg-surface ring-2 ring-primary/25",
                    state === "future" && "border-border/30 bg-transparent",
                    state === "off" && "border-transparent bg-muted/30",
                    state === "skipped" &&
                      "size-3 border-transparent text-[10px] leading-none text-muted-foreground",
                  )}
                >
                  {state === "skipped" && "–"}
                  {state === "done" && (
                    <span className="size-1.5 rounded-full bg-primary-foreground" />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
