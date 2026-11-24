ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS habit_type text NOT NULL DEFAULT 'yesno';

UPDATE public.habits
SET habit_type = CASE
  WHEN daily_goal_minutes > 0 THEN 'timed'
  ELSE 'yesno'
END;

ALTER TABLE public.habits
  ALTER COLUMN habit_type SET DEFAULT 'yesno',
  ALTER COLUMN habit_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.habits'::regclass
      AND conname = 'habits_habit_type_valid'
  ) THEN
    ALTER TABLE public.habits
      ADD CONSTRAINT habits_habit_type_valid
      CHECK (habit_type IN ('yesno', 'timed'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_habit_completion_xp(
  p_habit_id uuid,
  p_day date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz;
  v_completion_key text;
  v_streak_key text;
  v_transaction record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to cancel a habit entry.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.habits
    WHERE id = p_habit_id
      AND user_id = v_user_id
  ) THEN
    RETURN true;
  END IF;

  SELECT completed_at
  INTO v_completed_at
  FROM public.habit_logs
  WHERE habit_id = p_habit_id
    AND user_id = v_user_id
    AND day = p_day
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF v_completed_at < now() - interval '30 hours' THEN
    RAISE EXCEPTION 'Habit entries can only be changed within 30 hours.';
  END IF;

  DELETE FROM public.habit_logs
  WHERE habit_id = p_habit_id
    AND user_id = v_user_id
    AND day = p_day;

  v_completion_key := 'completion:' || p_habit_id || ':' || p_day;

  FOR v_transaction IN
    SELECT id, amount, idempotency_key
    FROM public.xp_transactions
    WHERE user_id = v_user_id
      AND idempotency_key = v_completion_key
  LOOP
    UPDATE public.user_xp
    SET
      total_xp = GREATEST(0, total_xp - v_transaction.amount),
      updated_at = now()
    WHERE user_id = v_user_id;

    DELETE FROM public.xp_transactions
    WHERE id = v_transaction.id;
  END LOOP;

  FOR v_streak_key IN
    SELECT idempotency_key
    FROM public.xp_transactions
    WHERE user_id = v_user_id
      AND idempotency_key LIKE 'streak:' || p_habit_id || ':%'
  LOOP
    DELETE FROM public.xp_transactions
    WHERE user_id = v_user_id
      AND idempotency_key = v_streak_key;
  END LOOP;

  PERFORM public.check_and_unlock_achievements(v_user_id);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_habit_completion_xp(uuid, date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.revoke_habit_completion_xp(uuid, date)
TO authenticated;

notify pgrst, 'reload schema';
