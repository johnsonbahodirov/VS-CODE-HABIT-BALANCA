-- Speeds up the per-user history queries used by Today, Habits and Stats.
-- Add-only and idempotent: safe to run more than once, touches no rows.
CREATE INDEX IF NOT EXISTS habit_logs_user_day_idx
  ON public.habit_logs (user_id, day DESC);

CREATE INDEX IF NOT EXISTS work_sessions_user_started_idx
  ON public.work_sessions (user_id, started_at DESC);
