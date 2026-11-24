import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { CircleCheck, PauseCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { HabitList, type HabitStatusFilter } from "@/components/app-widgets";
import { useHabits } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/habits")({
  head: () => ({ meta: [{ title: "Habits — Balance" }] }),
  component: Habits,
});

function Habits() {
  const habitsQuery = useHabits();
  const habits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const [statusFilter, setStatusFilter] = useState<HabitStatusFilter>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const activeCount = habits.filter((habit) => !habit.is_paused).length;
  const pausedCount = habits.length - activeCount;
  const countsUnavailable = habitsQuery.isLoading || habitsQuery.isError;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Habits</h1>
        <Button type="button" onClick={() => setCreateOpen(true)} className="min-h-11 rounded-2xl">
          <Plus className="size-4" /> New habit
        </Button>
      </header>

      <HabitFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      <section aria-label="Habit overview" className="grid grid-cols-2 gap-3">
        <OverviewTile
          label="Active"
          value={countsUnavailable ? "—" : String(activeCount)}
          icon={<CircleCheck className="size-4" />}
        />
        <OverviewTile
          label="Paused"
          value={countsUnavailable ? "—" : String(pausedCount)}
          icon={<PauseCircle className="size-4" />}
        />
      </section>

      <section className="space-y-4 rounded-3xl border border-primary/10 bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex gap-1 self-start rounded-2xl bg-cell/80 p-1">
          {(
            [
              ["active", "Active", activeCount],
              ["paused", "Paused", pausedCount],
            ] as const
          ).map(([filter, label, count]) => (
            <button
              key={filter}
              type="button"
              aria-pressed={statusFilter === filter}
              onClick={() => setStatusFilter(filter)}
              className={`min-h-9 rounded-xl px-3 text-xs font-semibold sm:text-sm ${
                statusFilter === filter
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs">{countsUnavailable ? "—" : count}</span>
            </button>
          ))}
        </div>
        <HabitList statusFilter={statusFilter} />
      </section>
    </div>
  );
}

function OverviewTile({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-primary/10 bg-surface p-3 shadow-sm sm:flex sm:items-center sm:gap-3 sm:px-4">
      <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="mt-2 sm:mt-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-lg font-bold leading-tight">{value}</p>
      </div>
    </div>
  );
}
