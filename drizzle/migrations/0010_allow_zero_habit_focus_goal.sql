ALTER TABLE public.habits
  ALTER COLUMN daily_goal_minutes SET DEFAULT 0;

-- Remove the existing check constraint on this column, including if its
-- generated name differs from the usual habits_daily_goal_minutes_check.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint AS con
    WHERE con.conrelid = 'public.habits'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%daily_goal_minutes%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.habits DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.habits
  ADD CONSTRAINT habits_daily_goal_minutes_range
  CHECK (daily_goal_minutes BETWEEN 0 AND 1440);
