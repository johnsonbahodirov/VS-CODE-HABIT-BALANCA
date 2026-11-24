ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS habit_type text NOT NULL DEFAULT 'yesno';

UPDATE public.habits
SET habit_type = CASE
  WHEN daily_goal_minutes > 0 THEN 'timed'
  ELSE 'yesno'
END;

ALTER TABLE public.habits
  ADD CONSTRAINT habits_habit_type_valid
  CHECK (habit_type IN ('yesno', 'timed'));
