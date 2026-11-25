import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Moon,
  Sun,
  BellRing,
  UserRound,
  Settings2,
  Minus,
  Plus,
  LogOut,
  Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DatabaseErrorNotice } from "@/components/database-error-notice";
import { Input } from "@/components/ui/input";
import { XpProgressCard } from "@/components/progress-widgets";
import {
  useAchievements,
  useHabitLogs,
  useHabits,
  useSessions,
  useSavePushSubscription,
  useSaveSettings,
  useSettings,
  useXPSummary,
  useXPHistory,
} from "@/lib/data";
import { toast } from "sonner";
import { downloadTextFile, habitLogsToCsv, sessionsToCsv } from "@/lib/export";
import { showFriendlyError } from "@/lib/feedback";

declare global {
  interface Window {
    __APP_ENV__?: { VITE_VAPID_PUBLIC_KEY?: string };
  }
}

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Balance" }] }),
  component: Profile,
});

function publicVapidKey(): string {
  return (
    import.meta.env["VITE_VAPID_PUBLIC_KEY"] ?? window.__APP_ENV__?.VITE_VAPID_PUBLIC_KEY ?? ""
  );
}

function pushIsConfigured(): boolean {
  return Boolean(publicVapidKey()) && import.meta.env["VITE_PUSH_REMINDERS_ENABLED"] === "true";
}

function decodeVapidKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function Profile() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const settingsQuery = useSettings();
  const settings = settingsQuery.data;
  const { data: xp } = useXPSummary();
  const xpHistory = useXPHistory();
  const achievementQuery = useAchievements();
  const habitsQuery = useHabits();
  const habits = habitsQuery.data ?? [];
  const xpGroups = new Map<string, NonNullable<typeof xpHistory.data>>();
  for (const transaction of xpHistory.data ?? []) {
    const day = transaction.day ?? transaction.created_at.slice(0, 10);
    const group = xpGroups.get(day) ?? [];
    group.push(transaction);
    xpGroups.set(day, group);
  }
  const groupedXpHistory = [...xpGroups.entries()];
  const saveSettings = useSaveSettings();
  const saveSubscription = useSavePushSubscription();
  const pushReady = pushIsConfigured();

  const signOut = async () => {
    try {
      await qc.cancelQueries();
      qc.clear();
      await supabase.rpc("heartbeat_social_presence", { p_online: false });
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      showFriendlyError(error);
    }
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) showFriendlyError(error);
      if (active) setEmail(data.user?.email ?? "");
    });
    const storedTheme = localStorage.getItem("balance-theme");
    const next = storedTheme === "dark" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    return () => {
      active = false;
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("balance-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    window.dispatchEvent(new CustomEvent("balance-theme-change", { detail: next }));
  };

  const enableReminders = async () => {
    const vapidKey = publicVapidKey();
    if (!pushReady || !vapidKey) {
      toast.error("Push reminders are not configured for this deployment.", {
        description:
          "Set the VAPID public key and explicitly enable this feature only after the scheduled Supabase sender is deployed.",
        duration: 7000,
      });
      return;
    }
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      toast.error("This browser does not support background push reminders.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notification permission was not granted.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(vapidKey) as BufferSource,
      });
      await saveSubscription.mutateAsync(subscription);
      await saveSettings.mutateAsync({ reminder_enabled: true });
      toast.success("Background reminders enabled");
    } catch (error) {
      showFriendlyError(error);
    }
  };

  const updateReminderTime = (time: string) => {
    if (/^\d{2}:\d{2}$/.test(time)) saveSettings.mutate({ reminder_time: time });
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Your account and preferences</p>
        <h1 className="text-3xl font-bold">Profile</h1>
      </header>
      <XpProgressCard />
      <Link
        to="/achievements"
        className="flex min-h-12 items-center justify-between rounded-2xl border bg-surface px-4 font-medium shadow-[var(--shadow-card)] hover:bg-primary/5"
      >
        <span className="flex items-center gap-3">
          <Trophy className="size-5 text-primary" />
          Rewards and achievements
        </span>
        <span aria-hidden="true">→</span>
      </Link>
      {(achievementQuery.data?.unlocked.filter((achievement) => achievement.is_featured).length ??
        0) > 0 && (
        <section className="rounded-3xl border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Showcased achievements</h2>
          <div className="flex flex-wrap gap-2">
            {achievementQuery.data?.unlocked
              .filter((achievement) => achievement.is_featured)
              .map((achievement) => {
                const details = achievementQuery.data?.catalog.find(
                  (item) => item.key === achievement.achievement_key,
                );
                return (
                  <span
                    key={achievement.achievement_key}
                    className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent"
                  >
                    {details?.name ?? achievement.achievement_key}
                  </span>
                );
              })}
          </div>
        </section>
      )}

      <section className="rounded-3xl border bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <UserRound />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">Account</h2>
            <p className="truncate text-sm text-muted-foreground">{email || "Signed in"}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <div>
            <p className="font-medium">Appearance</p>
            <p className="text-xs text-muted-foreground">Choose a comfortable theme</p>
          </div>
          <Button variant="outline" onClick={toggleTheme}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <div>
            <p className="font-medium text-destructive">Sign out</p>
            <p className="text-xs text-muted-foreground">End your current session on this device</p>
          </div>
          <Button
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={signOut}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Focus settings</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <SettingNumber
            label="Daily time goal"
            unit="min"
            value={settings?.daily_goal_minutes ?? 120}
            onSave={(value) => saveSettings.mutate({ daily_goal_minutes: value })}
          />
          <SettingNumber
            label="Focus session"
            unit="min"
            value={settings?.pomodoro_focus_minutes ?? 25}
            onSave={(value) => saveSettings.mutate({ pomodoro_focus_minutes: value })}
          />
          <SettingNumber
            label="Short break"
            unit="min"
            value={settings?.pomodoro_short_break_minutes ?? 5}
            onSave={(value) => saveSettings.mutate({ pomodoro_short_break_minutes: value })}
          />
          <SettingNumber
            label="Long break"
            unit="min"
            value={settings?.pomodoro_long_break_minutes ?? 15}
            onSave={(value) => saveSettings.mutate({ pomodoro_long_break_minutes: value })}
          />
        </div>
        {settingsQuery.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Preferences could not be loaded. Confirm the latest database migration is applied.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          A long break is suggested after every 4 completed focus sessions.
        </p>
      </section>

      <section className="rounded-3xl border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <BellRing className="mt-0.5 size-5 text-accent" />
            <div>
              <h2 className="text-lg font-semibold">Daily reminders</h2>
              <p className="text-sm text-muted-foreground">
                Push notification, including when the app is closed
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${settings?.reminder_enabled && pushReady ? "bg-primary/15 text-primary" : "bg-cell text-muted-foreground"}`}
          >
            {settings?.reminder_enabled && pushReady
              ? "Enabled"
              : pushReady
                ? "Off"
                : "Setup required"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Reminder time
            <Input
              type="time"
              value={settings?.reminder_time ?? "09:00"}
              onChange={(event) => updateReminderTime(event.target.value)}
              className="w-32"
            />
          </label>
          {settings?.reminder_enabled ? (
            <Button
              variant="outline"
              onClick={async () => {
                await saveSettings.mutateAsync({ reminder_enabled: false });
                toast.success("Daily reminders turned off");
              }}
            >
              Turn off
            </Button>
          ) : (
            <Button
              onClick={enableReminders}
              disabled={
                !pushReady ||
                settingsQuery.isLoading ||
                settingsQuery.isError ||
                saveSubscription.isPending ||
                saveSettings.isPending
              }
            >
              Enable push reminders
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Background delivery requires this deployment's VAPID keys and a scheduled Supabase
          `send-reminders` function. The deployment opt-in flag remains false until the sender and
          schedule are confirmed; there is no in-app-only fallback.
        </p>
      </section>

      <section className="rounded-3xl border bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold">XP history</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {(xp?.totalXp ?? 0).toLocaleString()} total XP · complete transaction history
        </p>
        {xpHistory.isError ? (
          <DatabaseErrorNotice
            title="Transaction history could not be loaded"
            error={xpHistory.error}
            onRetry={() => {
              void xpHistory.refetch();
            }}
          />
        ) : xpHistory.isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading XP transactions…</p>
        ) : xpHistory.data?.length ? (
          <div className="space-y-4">
            {groupedXpHistory.map(([day, transactions]) => (
              <section key={day}>
                <h3 className="border-b pb-2 text-xs font-semibold text-muted-foreground">
                  {new Date(`${day}T12:00:00`).toLocaleDateString([], {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
                <ul className="divide-y">
                  {transactions.map((transaction) => (
                    <li
                      key={transaction.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{transaction.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          {transaction.habit_id
                            ? (habits.find((habit) => habit.id === transaction.habit_id)?.name ??
                              "Habit")
                            : "General"}
                          {" · "}
                          {new Date(transaction.created_at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-mono font-semibold ${
                          transaction.amount < 0 ? "text-destructive" : "text-primary"
                        }`}
                      >
                        {transaction.amount > 0 ? "+" : ""}
                        {transaction.amount} XP
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            Complete a habit to earn your first XP.
          </p>
        )}
      </section>
      <DataExportCard />
    </div>
  );
}

function SettingNumber({
  label,
  unit,
  value,
  onSave,
}: {
  label: string;
  unit: string;
  value: number;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="block rounded-2xl bg-cell/70 p-3">
      <span className="mb-2 block text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Decrease ${label}`}
          disabled={Number(draft) <= 1}
          onClick={() => {
            const next = Math.max(1, (Number(draft) || value) - 1);
            setDraft(String(next));
            if (next !== value) onSave(next);
          }}
        >
          <Minus />
        </Button>
        <Input
          type="number"
          min={1}
          max={1440}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const next = Number(draft);
            if (Number.isInteger(next) && next >= 1 && next <= 1440 && next !== value) onSave(next);
            else setDraft(String(value));
          }}
          className="h-10"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Increase ${label}`}
          disabled={Number(draft) >= 1440}
          onClick={() => {
            const next = Math.min(1440, (Number(draft) || value) + 1);
            setDraft(String(next));
            if (next !== value) onSave(next);
          }}
        >
          <Plus />
        </Button>
      </span>
    </label>
  );
}

function DataExportCard() {
  const habits = useHabits().data ?? [];
  const logs = useHabitLogs().data ?? [];
  const sessions = useSessions().data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="space-y-3 rounded-2xl border bg-surface p-4">
      <h2 className="font-semibold">Your data</h2>
      <p className="text-sm text-muted-foreground">
        Download a copy of your habit history and focus sessions as CSV files.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            downloadTextFile(`balance-habits-${today}.csv`, habitLogsToCsv(habits, logs))
          }
        >
          Export habits
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            downloadTextFile(`balance-sessions-${today}.csv`, sessionsToCsv(habits, sessions))
          }
        >
          Export focus sessions
        </Button>
      </div>
    </section>
  );
}
