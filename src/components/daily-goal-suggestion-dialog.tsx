import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { habitIcon } from "@/lib/habit-meta";
import { colorBg, useHabitLogs, useHabits, useUpdateHabit } from "@/lib/data";
import { isHabitScheduledOnDay } from "@/lib/gamification";
import { isTimedHabit } from "@/lib/today";
import { dayKey } from "@/lib/balance";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Habit = Database["public"]["Tables"]["habits"]["Row"];

const ASK_COOLDOWN_DAYS = 7;

function localDateAfterCreated(habit: Habit, day: Date): boolean {
  if (!habit.created_at) return true;
  const createdKey = habit.created_at.slice(0, 10);
  return dayKey(day) >= createdKey;
}

function habitWasCompleted(
  logs: Array<{ habit_id: string; day: string; count: number }>,
  habit: Habit,
  day: string,
) {
  const matching = logs.filter((log) => log.habit_id === habit.id && log.day === day);
  if (matching.length === 0) return false;
  if (habit.tracking_type === "count") {
    return matching.some((log) => (log.count ?? 0) >= (habit.daily_goal_count ?? 1));
  }
  return matching.some((log) => (log.count ?? 1) >= 1);
}

function missedLastThreeScheduledDays(
  habit: Habit,
  logs: Array<{ habit_id: string; day: string; count: number }>,
  today: Date,
) {
  const missed: string[] = [];
  const cursor = new Date(today);
  cursor.setHours(12, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 1);

  for (let offset = 0; offset < 366 && missed.length < 3; offset++) {
    if (!localDateAfterCreated(habit, cursor)) break;
    const key = dayKey(cursor);
    if (isHabitScheduledOnDay(habit, key) && !habitWasCompleted(logs, habit, key)) missed.push(key);
    cursor.setDate(cursor.getDate() - 1);
  }
  return missed.length === 3;
}

export function DailyGoalSuggestionDialog() {
  const habitsQuery = useHabits();
  const logsQuery = useHabitLogs();
  const updateHabit = useUpdateHabit();
  const [currentHabit, setCurrentHabit] = useState<Habit | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const today = dayKey(now);
  const habits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const logs = useMemo(() => logsQuery.data ?? [], [logsQuery.data]);

  useEffect(() => {
    if (typeof window === "undefined" || habitsQuery.isLoading || logsQuery.isLoading) return;
    const askedToday = localStorage.getItem("balance_habit_suggestion_asked_today");
    if (askedToday === today) return;

    const candidate = habits.find((habit) => {
      if (habit.is_paused || habit.archived_at) return false;
      const lastAsked = localStorage.getItem(`balance_habit_suggestion_last_${habit.id}`);
      if (lastAsked) {
        const elapsed = Math.round(
          (new Date(`${today}T12:00:00`).getTime() - new Date(`${lastAsked}T12:00:00`).getTime()) /
            86400000,
        );
        if (elapsed >= 0 && elapsed < ASK_COOLDOWN_DAYS) return false;
      }
      return missedLastThreeScheduledDays(habit, logs, now);
    });
    setCurrentHabit(candidate ?? null);
  }, [habits, habitsQuery.isLoading, logs, logsQuery.isLoading, now, today]);

  const timed = currentHabit ? isTimedHabit(currentHabit) : false;
  const dailyGoal = currentHabit ? Math.max(0, currentHabit.daily_goal_minutes ?? 0) : 0;
  const reducedGoal = Math.max(5, Math.round(dailyGoal * 0.85));

  const rememberChoice = () => {
    if (!currentHabit) return;
    localStorage.setItem(`balance_habit_suggestion_last_${currentHabit.id}`, today);
    localStorage.setItem("balance_habit_suggestion_asked_today", today);
    setCurrentHabit(null);
  };

  const reduceGoal = () => {
    if (!currentHabit || !timed || reducedGoal >= dailyGoal) return;
    updateHabit.mutate(
      { id: currentHabit.id, updates: { daily_goal_minutes: reducedGoal } },
      { onSuccess: rememberChoice },
    );
  };

  return (
    <>
      <Dialog
        open={Boolean(currentHabit)}
        onOpenChange={(open) => {
          if (!open) rememberChoice();
        }}
      >
        {currentHabit && (
          <DialogContent className="border-primary/20 bg-surface sm:rounded-3xl">
            <DialogHeader className="items-center text-center">
              <span
                className={cn(
                  "mb-2 flex size-14 items-center justify-center rounded-2xl text-white",
                  colorBg[currentHabit.color] ?? colorBg.green,
                )}
              >
                {(() => {
                  const Icon = habitIcon(currentHabit.icon);
                  return <Icon className="size-7" />;
                })()}
              </span>
              <DialogTitle className="text-xl">
                Having a hard time with “{currentHabit.name}”?
              </DialogTitle>
              <DialogDescription>
                {timed
                  ? "You haven't completed it on your last 3 scheduled days. Would you like to reduce its daily time?"
                  : "You haven't completed it on your last 3 scheduled days. Would you like to change it?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              {timed && reducedGoal < dailyGoal && (
                <Button onClick={reduceGoal} disabled={updateHabit.isPending} className="w-full">
                  Yes, reduce to {reducedGoal} min
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditOpen(true)} className="w-full">
                Edit habit
              </Button>
              <Button variant="ghost" onClick={rememberChoice} className="w-full">
                {timed ? "No, keep it" : "Keep it as is"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      {currentHabit && (
        <HabitFormDialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) rememberChoice();
          }}
          habit={currentHabit}
        />
      )}
    </>
  );
}
