ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

UPDATE public.habits
SET start_date = created_at::date
WHERE start_date IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.habits'::regclass
      AND conname = 'habits_date_range_valid'
  ) THEN
    ALTER TABLE public.habits
      ADD CONSTRAINT habits_date_range_valid
      CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
  END IF;
END;
$$;

notify pgrst, 'reload schema';
