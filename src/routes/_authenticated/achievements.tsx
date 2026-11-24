import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { AchievementGrid, LevelRewards, XpProgressCard } from "@/components/progress-widgets";
import { Button } from "@/components/ui/button";
import { useAchievements } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/achievements")({
  head: () => ({ meta: [{ title: "Achievements — Balance" }] }),
  component: Achievements,
});

function Achievements() {
  const { data } = useAchievements();
  const unlocked = data?.unlocked.length ?? 0;
  const total = data?.catalog.length ?? 32;

  // Calculate total XP gained from unlocked achievements
  const unlockedKeys = new Set((data?.unlocked ?? []).map((u) => u.achievement_key));
  const earnedXp = (data?.catalog ?? [])
    .filter((a) => unlockedKeys.has(a.key))
    .reduce((sum, a) => sum + a.reward_xp, 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Small wins add up to something big</p>
        <h1 className="text-3xl font-bold tracking-tight">Achievements</h1>
      </header>
      <XpProgressCard />
      <LevelRewards />
      <section className="rounded-3xl border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-accent" />
            <h2 className="font-semibold text-foreground">Achievement Collection</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
              +{earnedXp.toLocaleString()} XP earned
            </span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {unlocked} / {total} unlocked
            </span>
          </div>
        </div>
        <div className="mt-5">
          <AchievementGrid />
        </div>
      </section>
      <Button asChild variant="outline" className="w-full">
        <Link to="/profile" viewTransition preload="intent" preloadDelay={0}>
          View XP history <ArrowRight className="ml-1 size-4" />
        </Link>
      </Button>
    </div>
  );
}
