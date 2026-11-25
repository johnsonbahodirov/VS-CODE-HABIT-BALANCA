import { useEffect, useMemo, useRef, useState } from "react";
import { Award, Check, CircleHelp, Lock, Trophy, Zap } from "lucide-react";
import {
  useAchievements,
  useHabitLogs,
  useHabits,
  useSetAchievementFeatured,
  useDailyXP,
  useXPSummary,
} from "@/lib/data";
import {
  ACHIEVEMENT_CATEGORIES,
  LEVEL_REWARDS,
  type AchievementCategory,
  type AchievementDefinition,
  getLevelProgress,
  getAchievementProgress,
  HABIT_COMPLETION_XP,
  STREAK_XP_MILESTONES,
  type AchievementTier,
} from "@/lib/gamification";
import { calculateAchievementUserStats } from "@/lib/achievement-stats";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatabaseErrorNotice } from "@/components/database-error-notice";
import { dayKey } from "@/lib/balance";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { friendlyErrorMessage } from "@/lib/feedback";

export function XpProgressCard({
  compact = false,
  showDaily = false,
  day,
}: {
  compact?: boolean;
  showDaily?: boolean;
  day?: string;
}) {
  const { data, error, isError, isLoading, refetch } = useXPSummary();
  const totalXp = data?.totalXp ?? 0;
  const level = getLevelProgress(totalXp);
  const todayXp = useDailyXP(day ?? dayKey(new Date()));
  const todayXpError = useMemo(
    () => (todayXp.isError ? friendlyErrorMessage(todayXp.error) : ""),
    [todayXp.error, todayXp.isError],
  );

  if (isError)
    return (
      <DatabaseErrorNotice
        title="XP data could not be loaded"
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  if (isLoading) return <div className="h-28 animate-pulse rounded-3xl bg-cell" />;

  return (
    <section className="rounded-3xl border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Award className="size-6" />
          </span>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Level {level.level} · {level.name}
            </p>
            <p className="font-mono text-xl font-bold">
              <span key={totalXp} className="number-tick">
                {totalXp.toLocaleString()}
              </span>{" "}
              <span className="text-sm font-medium text-muted-foreground">XP</span>
            </p>
          </div>
        </div>
        <span className="whitespace-nowrap rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {level.nextLevelXp === null
            ? "MAX"
            : `${(level.nextLevelXp - totalXp).toLocaleString()} XP to ${getLevelProgress(level.nextLevelXp).name}`}
        </span>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
          <span>{totalXp.toLocaleString()} XP total</span>
          <span>
            {level.nextLevelXp === null ? "MAX" : `${level.nextLevelXp.toLocaleString()} XP`}
          </span>
        </div>
        <Progress value={level.progressPercent} className="h-2.5" />
      </div>
      {showDaily &&
        (todayXp.isError ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {todayXpError}
          </p>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span>
              Today:{" "}
              <span key={todayXp.data ?? 0} className="number-tick">
                {Math.max(0, todayXp.data ?? 0)}
              </span>{" "}
              XP
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="How XP is earned"
                    className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <CircleHelp className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-80 text-sm leading-relaxed">
                  <p>
                    Habit completions award {HABIT_COMPLETION_XP.easy} XP for easy,{" "}
                    {HABIT_COMPLETION_XP.medium} XP for medium, and {HABIT_COMPLETION_XP.hard} XP
                    for hard habits. Streak milestones award {STREAK_XP_MILESTONES[3]},{" "}
                    {STREAK_XP_MILESTONES[7]}, or {STREAK_XP_MILESTONES[30]} bonus XP. Focus
                    sessions and achievements can also award XP. There is no daily XP cap or
                    separate all-habits-completed bonus configured, so this is your earned total
                    rather than a limit.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ))}
      {!compact && (
        <p className="mt-3 text-xs text-muted-foreground">
          Keep your routine going—each habit completion earns XP, with extra rewards for streaks.
        </p>
      )}
    </section>
  );
}

export function GamificationFeedback() {
  const xp = useXPSummary();
  const achievements = useAchievements();
  const previousXp = useRef<number | null>(null);
  const previousUnlocked = useRef<Set<string> | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; title: string } | null>(null);

  useEffect(() => {
    if (!xp.data) return;
    const level = getLevelProgress(xp.data.totalXp);
    if (previousXp.current !== null && level.level > getLevelProgress(previousXp.current).level) {
      setLevelUp({ level: level.level, title: level.name });
    }
    previousXp.current = xp.data.totalXp;
  }, [xp.data]);

  useEffect(() => {
    if (!achievements.data) return;
    const unlocked = new Set(achievements.data.unlocked.map((item) => item.achievement_key));
    if (previousUnlocked.current) {
      const newUnlocks = achievements.data.catalog.filter(
        (item) => unlocked.has(item.key) && !previousUnlocked.current?.has(item.key),
      );
      for (const unlock of newUnlocks) {
        toast.custom(
          (id) => (
            <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-surface p-3 text-foreground shadow-lg">
              <TierBadge tier={unlock.tier as AchievementTier} size={44} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">Achievement unlocked</p>
                <p className="truncate text-sm font-semibold">{unlock.name}</p>
                <p className="text-xs font-semibold text-primary">+{unlock.reward_xp} XP</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss achievement notification"
                onClick={() => toast.dismiss(id)}
                className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-cell"
              >
                Close
              </button>
            </div>
          ),
          {
            duration: 7000,
            className: "achievement-toast",
          },
        );
      }
    }
    previousUnlocked.current = unlocked;
  }, [achievements.data]);

  return (
    <Dialog
      open={Boolean(levelUp)}
      onOpenChange={(open) => {
        if (!open) setLevelUp(null);
      }}
    >
      <DialogContent className="level-up-dialog border-accent/70 bg-surface sm:rounded-3xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
        >
          {Array.from({ length: 18 }, (_, index) => (
            <span
              key={index}
              className="reward-confetti absolute top-0 size-2 rounded-sm"
              style={{
                left: `${(index * 37) % 98}%`,
                animationDelay: `${(index % 6) * 0.12}s`,
                backgroundColor: index % 2 ? "var(--primary)" : "var(--accent)",
              }}
            />
          ))}
        </div>
        <DialogHeader className="items-center text-center">
          <span className="level-up-emblem mb-2 flex size-16 items-center justify-center rounded-full bg-accent/20 text-accent">
            <Trophy className="size-8" />
          </span>
          <DialogTitle className="text-2xl">Level up!</DialogTitle>
          <DialogDescription>
            You reached level {levelUp?.level} — {levelUp?.title}. Your consistency is paying off.
          </DialogDescription>
        </DialogHeader>
        <div className="mx-auto rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
          {levelUp?.level === 8
            ? "You’ve reached the highest level."
            : "Your next milestone is waiting"}
        </div>
        <Button onClick={() => setLevelUp(null)} className="w-full">
          Keep going
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function TierBadge({ tier, size = 40 }: { tier: AchievementTier; size?: number }) {
  const colors: Record<AchievementTier, string> = {
    common: "text-slate-500 dark:text-slate-300",
    rare: "text-sky-600 dark:text-sky-400",
    epic: "text-violet-600 dark:text-violet-400",
    legendary: "text-amber-600 dark:text-amber-400",
  };
  const shapes: Record<AchievementTier, string> = {
    common: "M32 5 54 18v28L32 59 10 46V18z",
    rare: "M32 4 57 32 32 60 7 32z",
    epic: "M32 4 54 13v19c0 12-9 20-22 27C19 52 10 44 10 32V13z",
    legendary: "M32 4 39 18 55 20 44 31 47 47 32 40 17 47 20 31 9 20 25 18z",
  };
  return (
    <svg
      aria-label={`${tier} badge`}
      role="img"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={colors[tier]}
    >
      <path d={shapes[tier]} fill="currentColor" fillOpacity="0.16" />
      <path
        d={shapes[tier]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="31" r="8" fill="currentColor" fillOpacity="0.75" />
      <path
        d="m27 31 3.5 3.5L38 27"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LevelRewards() {
  const { data } = useXPSummary();
  const currentLevel = getLevelProgress(data?.totalXp ?? 0).level;
  return (
    <section className="rounded-3xl border bg-surface p-4 sm:p-5">
      <h2 className="font-semibold">Level rewards</h2>
      <p className="mt-1 text-sm text-muted-foreground">Avatar frames unlock as you level up.</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LEVEL_REWARDS.map((reward) => {
          const unlocked = currentLevel >= reward.level;
          return (
            <li
              key={reward.level}
              className={`rounded-2xl border p-3 text-center ${
                unlocked
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/60 bg-cell/40 opacity-70"
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 48 48"
                className={`mx-auto size-11 ${unlocked ? "text-primary" : "text-muted-foreground"}`}
              >
                <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="3" />
                <circle
                  cx="24"
                  cy="24"
                  r="13"
                  fill="currentColor"
                  fillOpacity={unlocked ? 0.18 : 0.08}
                />
                <path
                  d="M17 25h14M24 18v14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="m11 10 4 4m22-4-4 4M11 38l4-4m22 4-4-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <p className="mt-2 text-xs font-semibold">{reward.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {unlocked ? "Unlocked" : `Unlocks at level ${reward.level}`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AchievementGrid({
  showLocked = true,
  categoryFilter = "all",
  statusFilter = "all",
}: {
  showLocked?: boolean;
  categoryFilter?: "all" | AchievementCategory;
  statusFilter?: "all" | "unlocked" | "locked";
}) {
  const { data, error, isError, isLoading, refetch } = useAchievements();
  const habitsQuery = useHabits();
  const logsQuery = useHabitLogs();
  const xpQuery = useXPSummary();
  const setFeatured = useSetAchievementFeatured();

  const [activeCategory, setActiveCategory] = useState<"all" | AchievementCategory>(categoryFilter);
  const [activeStatus, setActiveStatus] = useState<"all" | "unlocked" | "locked">(statusFilter);

  useEffect(() => {
    if (categoryFilter !== "all") setActiveCategory(categoryFilter);
  }, [categoryFilter]);

  useEffect(() => {
    if (statusFilter !== "all") setActiveStatus(statusFilter);
  }, [statusFilter]);

  const unlockedMap = useMemo(
    () =>
      new Map(
        (data?.unlocked ?? []).map((item) => [
          item.achievement_key,
          { unlockedAt: item.unlocked_at, featured: item.is_featured },
        ]),
      ),
    [data?.unlocked],
  );

  const userStats = useMemo(() => {
    return calculateAchievementUserStats(
      habitsQuery.data ?? [],
      logsQuery.data ?? [],
      xpQuery.data?.totalXp ?? 0,
      dayKey(new Date()),
    );
  }, [habitsQuery.data, logsQuery.data, xpQuery.data?.totalXp]);

  if (isError)
    return (
      <DatabaseErrorNotice
        title="Achievements could not be loaded"
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading achievements…</p>;

  const catalog = data?.catalog ?? [];

  const filteredItems = catalog.filter((item) => {
    if (!showLocked && !unlockedMap.has(item.key)) return false;

    if (activeCategory !== "all" && item.category !== activeCategory) {
      return false;
    }

    const isUnlocked = unlockedMap.has(item.key);
    if (activeStatus === "unlocked" && !isUnlocked) return false;
    if (activeStatus === "locked" && isUnlocked) return false;

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Category Pills */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveCategory("all")}
          className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
            activeCategory === "all"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-surface border text-muted-foreground hover:bg-cell"
          }`}
        >
          All Categories
        </button>
        {ACHIEVEMENT_CATEGORIES.map((cat) => {
          const count = catalog.filter((item) => item.category === cat.id).length;
          const unlockedCount = catalog.filter(
            (item) => item.category === cat.id && unlockedMap.has(item.key),
          ).length;
          const isSelected = activeCategory === cat.id;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface border text-muted-foreground hover:bg-cell"
              }`}
            >
              <span>{cat.name}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-xs ${
                  isSelected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-cell text-muted-foreground"
                }`}
              >
                {unlockedCount}/{count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 rounded-2xl border bg-surface/80 p-1 text-xs">
        {(["all", "unlocked", "locked"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setActiveStatus(status)}
            className={`flex-1 rounded-xl py-1.5 font-medium capitalize transition-colors ${
              activeStatus === status
                ? "bg-cell text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {status === "all"
              ? `All (${catalog.length})`
              : status === "unlocked"
                ? `Unlocked (${unlockedMap.size})`
                : `Locked (${Math.max(0, catalog.length - unlockedMap.size)})`}
          </button>
        ))}
      </div>

      {/* Achievement Cards Grid */}
      {filteredItems.length === 0 ? (
        <div className="rounded-3xl border bg-surface/50 p-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No achievements found in this section.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredItems.map((achievement) => {
            const unlock = unlockedMap.get(achievement.key);
            const isUnlocked = Boolean(unlock);
            const unlockedAt = unlock?.unlockedAt;

            const progress = getAchievementProgress(
              achievement as unknown as AchievementDefinition,
              userStats,
              isUnlocked,
            );

            const tierBadgeStyle: Record<string, string> = {
              common: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/20",
              rare: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
              epic: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
              legendary:
                "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-sm",
            };

            const tierCardBorder: Record<string, string> = {
              common: isUnlocked ? "border-primary/20" : "border-border/60",
              rare: isUnlocked ? "border-sky-500/30 ring-1 ring-sky-500/20" : "border-border/60",
              epic: isUnlocked
                ? "border-violet-500/30 ring-1 ring-violet-500/20"
                : "border-border/60",
              legendary: isUnlocked
                ? "border-amber-500/40 ring-1 ring-amber-500/30 shadow-md shadow-amber-500/5"
                : "border-border/60",
            };

            return (
              <article
                key={achievement.key}
                className={`relative flex flex-col justify-between rounded-3xl border p-4 transition-[transform,opacity] duration-200 ${
                  isUnlocked ? "bg-surface shadow-sm" : "bg-surface/50 opacity-90 hover:opacity-100"
                } ${tierCardBorder[achievement.tier] ?? "border-border"}`}
              >
                <div>
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex size-12 shrink-0 items-center justify-center rounded-2xl transition-transform ${
                        isUnlocked
                          ? achievement.tier === "legendary"
                            ? "bg-gradient-to-br from-amber-500/30 to-amber-600/10 text-amber-500 shadow-inner"
                            : achievement.tier === "epic"
                              ? "bg-violet-500/20 text-violet-500"
                              : achievement.tier === "rare"
                                ? "bg-sky-500/20 text-sky-500"
                                : "bg-primary/20 text-primary"
                          : "bg-cell text-muted-foreground"
                      }`}
                    >
                      {isUnlocked ? (
                        <TierBadge tier={achievement.tier as AchievementTier} size={42} />
                      ) : (
                        <Lock className="size-5" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate font-semibold tracking-tight text-foreground">
                          {achievement.name}
                        </h3>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          +{achievement.reward_xp} XP
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                            tierBadgeStyle[achievement.tier] ?? tierBadgeStyle["common"]
                          }`}
                        >
                          {achievement.tier}
                        </span>
                        <span className="text-xs font-medium capitalize text-muted-foreground">
                          · {achievement.category.replace("_", " ")}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {achievement.description}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar for locked achievements */}
                  {!isUnlocked && (
                    <div className="mt-3.5 space-y-1.5 rounded-2xl bg-cell/50 p-2.5">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-mono text-foreground">{progress.label}</span>
                      </div>
                      <Progress value={progress.percentage} className="h-2" />
                    </div>
                  )}
                </div>

                {/* Footer status / actions */}
                <div className="mt-3.5 flex items-center justify-between border-t pt-2.5 text-xs">
                  {isUnlocked ? (
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <Check className="size-3.5" />
                      <span>
                        Unlocked {unlockedAt ? new Date(unlockedAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-1 font-medium">
                      <Zap className="size-3 text-muted-foreground" />
                      In progress ({progress.percentage}%)
                    </span>
                  )}

                  {isUnlocked && (
                    <button
                      type="button"
                      aria-pressed={Boolean(unlock?.featured)}
                      disabled={
                        setFeatured.isPending ||
                        (!unlock?.featured &&
                          (data?.unlocked.filter((item) => item.is_featured).length ?? 0) >= 3)
                      }
                      onClick={() =>
                        setFeatured.mutate({
                          achievement_key: achievement.key,
                          featured: !unlock?.featured,
                        })
                      }
                      className="font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      {unlock?.featured ? "Remove from showcase" : "Showcase"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
