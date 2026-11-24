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
  ChevronLeft,
  ChevronRight,
  Settings,
  Search,
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
import { Input } from "@/components/ui/input";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("balance-sidebar-collapsed") === "true",
  );
  const [userLabel, setUserLabel] = useState("Your account");
  const [searchValue, setSearchValue] = useState("");
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
  useEffect(() => {
    const handleHabitSearch = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string")
        setSearchValue(event.detail);
    };
    window.addEventListener("balance-habit-search", handleHabitSearch);
    return () => window.removeEventListener("balance-habit-search", handleHabitSearch);
  }, []);
  // Loading settings also syncs the browser timezone to the server (XP and streak days).
  useSettings();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const supportsViewTransitions =
    typeof document !== "undefined" && "startViewTransition" in document;
  useEffect(() => {
    if (pathname === "/habits")
      window.dispatchEvent(new CustomEvent("balance-habit-search", { detail: searchValue }));
  }, [pathname, searchValue]);
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.rpc("heartbeat_social_presence", { p_online: false });
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    window.localStorage.setItem("balance-sidebar-collapsed", String(next));
  };
  const updateSearch = (value: string) => {
    setSearchValue(value);
  };
  return (
    <div
      className={`mx-auto grid min-h-screen w-full max-w-[1760px] grid-cols-1 pb-28 lg:items-start lg:gap-6 lg:px-5 lg:pb-0 xl:gap-8 xl:px-7 ${
        sidebarCollapsed
          ? "lg:grid-cols-[76px_minmax(0,1fr)]"
          : "lg:grid-cols-[240px_minmax(0,1fr)]"
      }`}
    >
      <SocialPresenceHeartbeat />
      <GamificationFeedback />
      <aside className="hidden self-start lg:sticky lg:top-5 lg:col-start-1 lg:flex lg:flex-col lg:py-5">
        <div className="flex flex-col rounded-3xl border bg-surface p-4 shadow-sm">
          <Link
            to="/today"
            viewTransition
            preload="intent"
            preloadDelay={0}
            title="Habit Balance"
            className={`mb-5 flex items-center gap-2 pt-2 ${
              sidebarCollapsed ? "justify-center" : "px-2"
            }`}
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="size-5" />
            </span>
            {!sidebarCollapsed && (
              <span className="font-semibold tracking-tight">Habit Balance</span>
            )}
          </Link>
          <nav aria-label="Main navigation" className="space-y-1">
            {tabs.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                viewTransition
                preload="intent"
                preloadDelay={0}
                title={sidebarCollapsed ? label : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
                  sidebarCollapsed ? "justify-center px-2" : "px-3"
                }`}
                activeProps={{ className: "bg-primary/10 font-semibold text-primary" }}
              >
                <Icon className="size-4.5 shrink-0" />
                {!sidebarCollapsed && <span>{label}</span>}
              </Link>
            ))}
          </nav>
          <div className="mt-auto pt-4">
            {sidebarCollapsed ? (
              <Link
                to="/achievements"
                aria-label="Level and XP progress"
                title="Level and XP progress"
                className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
              >
                <Trophy className="size-5" />
              </Link>
            ) : (
              <XpProgressCard compact showDaily />
            )}
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`mt-3 flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
                sidebarCollapsed ? "mx-auto" : "ml-auto"
              }`}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronLeft className="size-4" />
              )}
            </button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <header className="flex min-h-16 items-center justify-between gap-4 px-4 pt-4 sm:px-6 lg:min-h-14 lg:px-0 lg:pt-0">
          <span className="font-mono text-sm font-bold tracking-widest text-primary lg:hidden">
            BALANCE
          </span>
          {pathname === "/habits" && (
            <label className="relative hidden min-w-0 flex-1 md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="Search habits..."
                aria-label="Search habits"
                className="h-11 rounded-2xl border-0 bg-surface pl-10 shadow-sm"
              />
            </label>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open account menu"
                className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full border bg-surface text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary/5"
              >
                {userLabel === "Your account" ? (
                  <UserRound className="size-5" />
                ) : (
                  userLabel[0]?.toUpperCase()
                )}
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
        </header>
        <main className="app-route-content px-4 pt-3 pb-10 sm:px-6 lg:px-0 lg:pt-2 lg:pb-10">
          <div key={pathname} className={supportsViewTransitions ? "" : "route-enter"}>
            <Outlet />
          </div>
        </main>
      </div>
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto flex w-[min(96%,42rem)] justify-around rounded-3xl border bg-surface/95 p-1.5 shadow-lg backdrop-blur-md sm:p-2 lg:hidden"
      >
        {mobileTabs.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            viewTransition
            preload="intent"
            preloadDelay={0}
            className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-xs font-medium text-muted-foreground transition-all select-none touch-manipulation active:scale-95"
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
