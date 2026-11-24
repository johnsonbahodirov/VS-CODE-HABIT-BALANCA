-- Speeds up range-based XP stats queries and habit notes lookups.
-- Add-only and idempotent: safe to run more than once, touches no rows.
CREATE INDEX IF NOT EXISTS xp_transactions_user_day_idx
  ON public.xp_transactions (user_id, day DESC);

CREATE INDEX IF NOT EXISTS habit_notes_user_day_idx
  ON public.habit_notes (user_id, day DESC);
