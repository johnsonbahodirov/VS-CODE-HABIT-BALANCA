import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Archive, CircleCheck, PauseCircle, Plus, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { HabitList, type HabitSortOrder, type HabitStatusFilter } from "@/components/app-widgets";
import { useHabits } from "@/lib/data";
import { HABIT_CATEGORIES } from "@/lib/habit-meta";

export const Route = createFileRoute("/_authenticated/habits")({
  head: () => ({ meta: [{ title: "Habits — Balance" }] }),
  component: Habits,
});

function Habits() {
  const habitsQuery = useHabits();
  const habits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HabitStatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<HabitSortOrder>("oldest");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [createOpen, setCreateOpen] = useState(false);
  const activeCount = useMemo(
    () => habits.filter((habit) => !habit.archived_at && !habit.is_paused).length,
    [habits],
  );
  const pausedCount = useMemo(
    () => habits.filter((habit) => !habit.archived_at && habit.is_paused).length,
    [habits],
  );
  const archivedCount = useMemo(
    () => habits.filter((habit) => Boolean(habit.archived_at)).length,
    [habits],
  );
  const countsUnavailable = habitsQuery.isLoading || habitsQuery.isError;

  useEffect(() => {
    const handleSearch = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") setSearch(event.detail);
    };
    window.addEventListener("balance-habit-search", handleSearch);
    return () => window.removeEventListener("balance-habit-search", handleSearch);
  }, []);

  const openCreateForm = () => setCreateOpen(true);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Build a rhythm that works for you</p>
          <h1 className="text-3xl font-bold tracking-tight">Habits</h1>
        </div>
        <Button type="button" onClick={openCreateForm} className="min-h-11 rounded-2xl">
          <Plus className="size-4" /> Create a habit
        </Button>
      </header>

      <HabitFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      <section aria-label="Habit overview" className="grid grid-cols-3 gap-3">
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
        <OverviewTile
          label="Archived"
          value={countsUnavailable ? "—" : String(archivedCount)}
          icon={<Archive className="size-4" />}
        />
      </section>

      <section className="space-y-4 rounded-3xl border border-primary/10 bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-cell/80 p-1">
            {(
              [
                ["all", "All"],
                ["active", "Active"],
                ["paused", "Paused"],
                ["archived", "Archived"],
              ] as const
            ).map(([filter, label]) => (
              <button
                key={filter}
                type="button"
                aria-pressed={statusFilter === filter}
                onClick={() => setStatusFilter(filter)}
                className={`min-h-9 shrink-0 rounded-xl px-3 text-xs font-semibold transition-colors sm:text-sm ${
                  statusFilter === filter
                    ? "bg-surface text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span className="ml-1.5 text-xs">
                  {filter === "all"
                    ? activeCount + pausedCount
                    : filter === "active"
                      ? activeCount
                      : filter === "paused"
                        ? pausedCount
                        : archivedCount}
                </span>
              </button>
            ))}
          </div>
          <label className="relative block min-w-0 md:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                const value = event.target.value;
                setSearch(value);
                window.dispatchEvent(new CustomEvent("balance-habit-search", { detail: value }));
              }}
              placeholder="Search habits..."
              aria-label="Search habits"
              className="h-10 rounded-xl bg-background pl-10"
            />
          </label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-10 w-full rounded-xl bg-background sm:w-48">
              <SelectValue aria-label="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All categories">All categories</SelectItem>
              {HABIT_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sortOrder}
            onValueChange={(value) => setSortOrder(value as HabitSortOrder)}
          >
            <SelectTrigger className="h-10 w-full rounded-xl bg-background sm:w-40">
              <SelectValue aria-label="Sort habits" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="alphabetical">A to Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <HabitList
          searchTerm={search}
          categoryFilter={categoryFilter}
          statusFilter={statusFilter}
          sortOrder={sortOrder}
        />
      </section>

      <button
        type="button"
        onClick={openCreateForm}
        className="flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl border border-dashed border-primary/30 bg-primary/[0.03] p-5 text-sm font-semibold text-primary transition-colors hover:border-primary/60 hover:bg-primary/[0.06]"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Plus className="size-5" />
        </span>
        Create another habit
      </button>
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
