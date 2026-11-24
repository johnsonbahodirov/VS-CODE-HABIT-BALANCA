/* global Deno */
import { createClient } from "npm:@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

type SettingsRow = {
  user_id: string;
  timezone: string;
  reminder_time: string;
  reminder_enabled: boolean;
};

type HabitReminderRow = {
  id: string;
  user_id: string;
  name: string;
  reminder_time: string;
  frequency: string;
  schedule_days: number[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Push delivery secrets are not configured." }, 500);
  }

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("user_id, timezone, reminder_time, reminder_enabled");
  if (settingsError) return json({ error: settingsError.message }, 500);

  const now = new Date();
  let sent = 0;
  const failures: string[] = [];
  const settingsByUser = new Map((settings ?? []).map((setting) => [setting.user_id, setting]));
  const localTimes = new Map<string, { time: string; day: string }>();

  for (const setting of (settings ?? []) as SettingsRow[]) {
    const timezone = setting.timezone || "UTC";
    let localTime: string;
    let localDay: string;
    try {
      localTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(now);
      const dateParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const datePart = (type: string) => dateParts.find((part) => part.type === type)?.value ?? "";
      localDay = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
    } catch (error) {
      failures.push(`Invalid timezone for ${setting.user_id}: ${String(error)}`);
      continue;
    }

    localTimes.set(setting.user_id, { time: localTime, day: localDay });
    if (!setting.reminder_enabled || localTime !== setting.reminder_time.slice(0, 5)) continue;

    const { data: claim, error: claimError } = await supabase
      .from("reminder_deliveries")
      .upsert(
        { user_id: setting.user_id, day: localDay },
        { onConflict: "user_id,day", ignoreDuplicates: true },
      )
      .select("user_id")
      .maybeSingle();
    if (claimError) {
      failures.push(`Could not claim reminder for ${setting.user_id}: ${claimError.message}`);
      continue;
    }
    if (!claim) continue;

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("reminder_subscriptions")
      .select("id, subscription")
      .eq("user_id", setting.user_id);
    if (subscriptionError) {
      failures.push(
        `Could not load subscriptions for ${setting.user_id}: ${subscriptionError.message}`,
      );
      continue;
    }

    for (const subscription of subscriptions ?? []) {
      try {
        await webPush.sendNotification(
          subscription.subscription,
          JSON.stringify({
            title: "Your habits are waiting",
            body: "A small check-in today keeps your progress moving.",
            url: "/today",
          }),
        );
        sent++;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await supabase
            .from("reminder_subscriptions")
            .delete()
            .eq("id", subscription.id);
          if (deleteError)
            failures.push(`Could not remove expired subscription: ${deleteError.message}`);
        } else {
          failures.push(`Push delivery failed for ${setting.user_id}: ${String(error)}`);
        }
      }
    }
  }

  const { data: habitReminders, error: habitReminderError } = await supabase
    .from("habits")
    .select("id, user_id, name, reminder_time, frequency, schedule_days")
    .eq("reminder_enabled", true)
    .eq("is_paused", false)
    .is("archived_at", null);
  if (habitReminderError) return json({ error: habitReminderError.message }, 500);

  for (const habit of (habitReminders ?? []) as HabitReminderRow[]) {
    const setting = settingsByUser.get(habit.user_id) as SettingsRow | undefined;
    const local = localTimes.get(habit.user_id);
    if (!setting || !local || local.time !== habit.reminder_time.slice(0, 5)) continue;

    const weekday = new Date(`${local.day}T12:00:00`).getDay();
    const scheduled =
      habit.frequency === "daily" ||
      (habit.frequency === "weekdays" && weekday >= 1 && weekday <= 5) ||
      ((habit.frequency === "selected_days" || habit.frequency === "custom") &&
        habit.schedule_days.includes(weekday));
    if (!scheduled) continue;

    const { data: claim, error: claimError } = await supabase
      .from("habit_reminder_deliveries")
      .upsert(
        { habit_id: habit.id, user_id: habit.user_id, day: local.day },
        { onConflict: "habit_id,day", ignoreDuplicates: true },
      )
      .select("habit_id")
      .maybeSingle();
    if (claimError) {
      failures.push(`Could not claim habit reminder for ${habit.id}: ${claimError.message}`);
      continue;
    }
    if (!claim) continue;

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("reminder_subscriptions")
      .select("id, subscription")
      .eq("user_id", habit.user_id);
    if (subscriptionError) {
      failures.push(
        `Could not load subscriptions for ${habit.user_id}: ${subscriptionError.message}`,
      );
      continue;
    }
    for (const subscription of subscriptions ?? []) {
      try {
        await webPush.sendNotification(
          subscription.subscription,
          JSON.stringify({
            title: "Habit reminder",
            body: `Time to check in on ${habit.name}.`,
            url: "/today",
          }),
        );
        sent++;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await supabase
            .from("reminder_subscriptions")
            .delete()
            .eq("id", subscription.id);
          if (deleteError)
            failures.push(`Could not remove expired subscription: ${deleteError.message}`);
        } else {
          failures.push(`Habit reminder delivery failed for ${habit.user_id}: ${String(error)}`);
        }
      }
    }
  }

  if (failures.length) console.error("Reminder delivery issues", failures);
  return json({ sent, failures });
});
