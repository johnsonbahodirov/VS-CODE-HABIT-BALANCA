ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS skipped_dates date[] NOT NULL DEFAULT ARRAY[]::date[],
  ADD COLUMN IF NOT EXISTS streak_freezes integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.habits'::regclass
      AND conname = 'habits_streak_freezes_nonnegative'
  ) THEN
    ALTER TABLE public.habits
      ADD CONSTRAINT habits_streak_freezes_nonnegative
      CHECK (streak_freezes >= 0);
  END IF;
END;
$$;
