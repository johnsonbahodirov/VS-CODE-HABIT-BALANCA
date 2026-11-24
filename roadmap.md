# Roadmap

## Done in code

Verified with TypeScript, the vitest suite and a production build.

- [x] Remove daily work target; replace Balance tab with per-habit time stats
- [x] Sessions show habit name (timer started for a habit)
- [x] Habit category + icon picker
- [x] Pomodoro (25/5, long break every 4), stopwatch, streaks, progress warnings
- [x] XP, levels and achievements with a server-side append-only ledger
- [x] Day/week/month/3-month/6-month/year stats, contribution calendar, day notes
- [x] Friends window: 6-digit IDs, requests, block/unblock, opt-in sharing
- [x] Reminders code path: service worker, Edge Function sender, honest "Setup required" state

## Pending — needs your Supabase / Lovable access

The connected database is still at migration `0001`. Tables and columns added by
`0002` are missing, so against the live project **adding a habit and checking one
off fail**, and XP, day notes, reminders and friends stay unavailable.

- [ ] Apply `drizzle/migrations/0002_progress_gamification.sql`
- [ ] Apply `drizzle/migrations/0003_friends.sql` (after 0002 — it depends on 0002 objects)
- [ ] Deploy the `send-reminders` Edge Function with `CRON_SECRET`, the VAPID key pair,
      `VAPID_SUBJECT`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then give it a schedule
- [ ] Set `VITE_VAPID_PUBLIC_KEY` and flip `VITE_PUSH_REMINDERS_ENABLED=true` only after the
      sender is deployed and scheduled — until then the UI keeps reporting reminders as unset
- [ ] Deliver the updated source ZIP to Files

Both migrations are forward-only and add-only: no `DROP`, no `TRUNCATE`, no column
removals. The only statement that touches existing rows is the cleanup in `0002` that
closes duplicate running `work_sessions` rows (`ended_at`) so the one-active-timer-per-user
unique index can be created; no session rows are deleted.
