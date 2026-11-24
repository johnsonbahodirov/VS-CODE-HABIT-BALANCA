import {
  createFileRoute,
  redirect,
  Outlet,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  ChartNoAxesCombined,
  Trophy,
  UserRound,
  Sun,
  LogOut,
  Users,
  Leaf,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GamificationFeedback, XpProgressCard } from "@/components/progress-widgets";
import { useSettings } from "@/lib/data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Local session check: avoids a network call on every tab switch.
    const { data, error } = await supabase.auth.getSession();
    if (error && import.meta.env.DEV) {
      console.warn("[Supabase Auth] Protected route session check failed", {
        name: error.name,
        code: "code" in error ? error.code : undefined,
      });
    }
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: AppLayout,
});

const tabs = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/habits", label: "Habits", icon: CalendarCheck },
  { to: "/stats", label: "Stats", icon: ChartNoAxesCombined },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/achievements", label: "Rewards", icon: Trophy },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

const mobileTabs = tabs.filter((tab) => tab.to !== "/achievements");

function AppLayout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [userLabel, setUserLabel] = useState("Your account");
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void navigate({ to: "/auth", replace: true });
      }
    });
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      const email = sessionData.session?.user.email;
      if (email) setUserLabel(email);
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);
  // Loading settings also syncs the browser timezone to the server (XP and streak days).
  useSettings();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const supportsViewTransitions =
    typeof document !== "undefined" && "startViewTransition" in document;
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.rpc("heartbeat_social_presence", { p_online: false });
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <div className="app-shell mx-auto grid min-h-screen w-full max-w-[1360px] grid-cols-1 gap-5 px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] min-[768px]:grid-cols-[64px_minmax(0,1fr)] min-[768px]:pb-0 min-[1100px]:grid-cols-[232px_minmax(0,1fr)]">
      <SocialPresenceHeartbeat />
      <GamificationFeedback />
      <aside className="app-sidebar hidden self-start min-[768px]:sticky min-[768px]:top-4 min-[768px]:col-start-1 min-[768px]:flex min-[768px]:h-[calc(100dvh-2rem)] min-[768px]:flex-col min-[768px]:pt-4">
        <div className="flex h-full flex-col rounded-3xl border bg-surface p-2 shadow-sm min-[1100px]:p-4">
          <Link
            to="/today"
            viewTransition
            preload="intent"
            preloadDelay={0}
            title="Habit Balance"
            className="mb-5 flex items-center justify-center gap-2 pt-2 min-[1100px]:justify-start min-[1100px]:px-2"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="size-5" />
            </span>
            <span className="hidden font-semibold tracking-tight min-[1100px]:inline">
              Habit Balance
            </span>
          </Link>
          <nav aria-label="Main navigation" className="space-y-1">
            {tabs.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                viewTransition
                preload="intent"
                preloadDelay={0}
                title={label}
                className="flex min-h-11 items-center justify-center gap-3 rounded-xl px-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground min-[1100px]:justify-start min-[1100px]:px-3"
                activeProps={{ className: "bg-primary/10 font-semibold text-primary" }}
              >
                <Icon className="size-4.5 shrink-0" />
                <span className="hidden min-[1100px]:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="pt-4">
            <div className="hidden min-[1100px]:block">
              <XpProgressCard compact showDaily />
            </div>
            <Link
              to="/achievements"
              aria-label="Level and XP progress"
              title="Level and XP progress"
              className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary min-[1100px]:hidden"
            >
              <Trophy className="size-5" />
            </Link>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open account menu"
                className="mx-auto mt-3 flex size-11 shrink-0 items-center justify-center rounded-full border bg-surface text-sm font-semibold text-primary shadow-sm transition-colors duration-150 hover:bg-primary/5 min-[1100px]:w-full min-[1100px]:justify-start min-[1100px]:gap-3 min-[1100px]:rounded-xl min-[1100px]:px-2"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  {userLabel === "Your account" ? (
                    <UserRound className="size-5" />
                  ) : (
                    userLabel[0]?.toUpperCase()
                  )}
                </span>
                <span className="hidden min-w-0 truncate min-[1100px]:inline">{userLabel}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl">
              <DropdownMenuLabel className="truncate">{userLabel}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void navigate({ to: "/profile" })}>
                <Settings /> Profile and settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <div className="min-w-0 min-[768px]:col-start-2">
        <header className="flex min-h-16 items-center justify-between gap-4 px-4 pt-4 sm:px-6 min-[768px]:hidden">
          <span className="font-mono text-sm font-bold tracking-widest text-primary min-[768px]:hidden">
            BALANCE
          </span>
        </header>
        <main className="app-route-content min-w-0 px-4 pt-3 pb-10 sm:px-6 min-[768px]:px-0 min-[768px]:pt-4 min-[768px]:pb-10">
          <div key={pathname} className={supportsViewTransitions ? "" : "route-enter"}>
            <Outlet />
          </div>
        </main>
      </div>
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto flex w-[min(96%,42rem)] justify-around rounded-3xl border bg-surface/95 p-1.5 shadow-lg backdrop-blur-md sm:p-2 min-[768px]:hidden"
      >
        {mobileTabs.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            viewTransition
            preload="intent"
            preloadDelay={0}
            className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 select-none touch-manipulation active:scale-95"
            activeProps={{ className: "bg-muted font-semibold text-primary shadow-xs" }}
          >
            <Icon className="size-4.5 shrink-0 sm:size-5" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function SocialPresenceHeartbeat() {
  const loggedFailure = useRef(false);

  useEffect(() => {
    const heartbeat = () => {
      void supabase.rpc("heartbeat_social_presence").then(({ error }) => {
        if (error && !loggedFailure.current) {
          console.warn("Could not update friend presence; apply the friends migration.", error);
          loggedFailure.current = true;
        } else if (!error) {
          loggedFailure.current = false;
        }
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 60_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
