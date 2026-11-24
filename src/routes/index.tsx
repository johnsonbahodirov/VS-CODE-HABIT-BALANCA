import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, CalendarCheck, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Balance — Habits & Work Time Tracker" },
      {
        name: "description",
        content:
          "Build daily habits and keep your work-life time balance in check. Free, synced to your account.",
      },
      { property: "og:title", content: "Balance — Habits & Work Time Tracker" },
      {
        property: "og:description",
        content: "Build daily habits and keep your work-life time balance in check.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const cells = Array.from({ length: 84 }, (_, i) => (i * 37) % 7 < 4);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-10 px-6 py-12">
      <span className="font-mono text-sm font-bold tracking-widest text-primary">BALANCE</span>
      <h1 className="text-5xl font-bold leading-[1.05]">
        Habits that stick.
        <br />
        <span className="text-accent">Time that balances.</span>
      </h1>
      <div className="grid grid-flow-col grid-rows-7 gap-[4px]">
        {cells.map((on, i) => (
          <div
            key={i}
            className={
              on ? "aspect-square rounded-[3px] bg-primary" : "aspect-square rounded-[3px] bg-cell"
            }
          />
        ))}
      </div>
      <ul className="space-y-3 text-muted-foreground">
        <li className="flex gap-3">
          <CalendarCheck className="size-5 text-primary" /> Daily habit check-ins with streak grids
        </li>
        <li className="flex gap-3">
          <Timer className="size-5 text-accent" /> Pomodoro focus timer with per-habit time goals
        </li>
        <li className="flex gap-3">
          <Award className="size-5 text-primary" /> XP, levels and achievement badges
        </li>
        <li className="flex gap-3">
          <Users className="size-5 text-accent" /> Friends with opt-in progress sharing
        </li>
      </ul>
      <Button asChild variant="neon" size="lg" className="h-12">
        <Link to="/today" viewTransition preload="intent">
          Get started
        </Link>
      </Button>
    </div>
  );
}
