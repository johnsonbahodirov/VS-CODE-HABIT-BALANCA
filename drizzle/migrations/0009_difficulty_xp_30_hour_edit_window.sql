
ALTER TABLE public.habit_logs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.habit_logs
SET updated_at = created_at
FROM (
  SELECT
    habit_id,
    day,
    NULL::timestamptz AS created_at
  FROM public.habit_logs
) AS legacy
WHERE false;

ALTER TABLE public.habit_logs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.habit_logs
  ALTER COLUMN completed_at SET DEFAULT now();

UPDATE public.habit_logs
SET completed_at = COALESCE(completed_at, now())
WHERE completed_at IS NULL;

ALTER TABLE public.habit_logs
  ALTER COLUMN completed_at SET NOT NULL;

DROP TRIGGER IF EXISTS enforce_habit_log_edit_window ON public.habit_logs;
DROP FUNCTION IF EXISTS public.enforce_habit_log_edit_window();

CREATE OR REPLACE FUNCTION public.enforce_habit_log_edit_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.completed_at < now() - interval '30 hours'
  THEN
    RAISE EXCEPTION 'Habit entries can only be changed within 30 hours.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.completed_at := OLD.completed_at;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_habit_log_edit_window()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_habit_log_edit_window()
TO authenticated;

CREATE TRIGGER enforce_habit_log_edit_window
BEFORE UPDATE ON public.habit_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_habit_log_edit_window();

CREATE OR REPLACE FUNCTION public.habit_completion_xp(p_difficulty text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE lower(coalesce(p_difficulty, 'medium'))
    WHEN 'easy' THEN 5
    WHEN 'hard' THEN 15
    ELSE 10
  END;
$$;

REVOKE ALL ON FUNCTION public.habit_completion_xp(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.habit_completion_xp(text)
TO authenticated;

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
    RAISE EXCEPTION 'Habit not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.habit_logs
    WHERE habit_id = p_habit_id
      AND user_id = v_user_id
      AND day = p_day
  ) THEN
    RAISE EXCEPTION 'Habit entry not found.';
  END IF;

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

DROP TRIGGER IF EXISTS award_habit_completion_xp ON public.habit_logs;
DROP FUNCTION IF EXISTS public.award_habit_completion_xp();

CREATE OR REPLACE FUNCTION public.award_habit_completion_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_habit public.habits%ROWTYPE;
  v_timezone text;
  v_today date;
  v_completion_xp integer;
  v_streak integer := 0;
  v_day date;
  v_milestone_xp integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.completed_at IS NULL
       OR OLD.completed_at < now() - interval '30 hours'
    THEN
      RAISE EXCEPTION 'Habit entries can only be changed within 30 hours.';
    END IF;
  END IF;

  SELECT *
  INTO v_habit
  FROM public.habits
  WHERE id = NEW.habit_id
    AND user_id = NEW.user_id
    AND NOT is_paused
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_habit.tracking_type = 'count' THEN
    IF NEW.count < v_habit.daily_goal_count THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.count < 1 THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT timezone
  INTO v_timezone
  FROM public.user_settings
  WHERE user_id = NEW.user_id;

  IF v_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
  ) THEN
    v_timezone := 'UTC';
  END IF;

  v_today := (now() AT TIME ZONE v_timezone)::date;

  IF NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  IF NEW.completed_at < now() - interval '30 hours' THEN
    RETURN NEW;
  END IF;

  IF NEW.day <> v_today THEN
    RETURN NEW;
  END IF;

  v_completion_xp := public.habit_completion_xp(v_habit.difficulty);

  PERFORM public.grant_habit_xp(
    NEW.user_id,
    v_completion_xp,
    'Habit completion',
    'completion:' || NEW.habit_id || ':' || NEW.day,
    NEW.habit_id,
    NEW.day
  );

  v_day := NEW.day;

  WHILE v_streak < 366 LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.habit_logs l
      JOIN public.habits h ON h.id = l.habit_id
      WHERE l.habit_id = NEW.habit_id
        AND l.user_id = NEW.user_id
        AND l.day = v_day - 1
        AND CASE
          WHEN h.tracking_type = 'count'
            THEN l.count >= h.daily_goal_count
          ELSE l.count >= 1
        END
        AND CASE
          WHEN h.frequency = 'daily' THEN true
          WHEN h.frequency = 'weekdays'
            THEN extract(dow FROM (v_day - 1)::timestamp)::integer BETWEEN 1 AND 5
          ELSE
            extract(dow FROM (v_day - 1)::timestamp)::integer = ANY(h.schedule_days)
        END
    );

    v_streak := v_streak + 1;
    v_day := v_day - 1;
  END LOOP;

  IF v_streak + 1 IN (3, 7, 30) THEN
    v_milestone_xp := CASE v_streak + 1
      WHEN 3 THEN 30
      WHEN 7 THEN 100
      WHEN 30 THEN 300
      ELSE 0
    END;

    PERFORM public.grant_habit_xp(
      NEW.user_id,
      v_milestone_xp,
      (v_streak + 1)::text || '-day habit streak',
      'streak:' || NEW.habit_id || ':' || (v_streak + 1),
      NEW.habit_id,
      NEW.day
    );
  END IF;

  IF v_streak + 1 >= 3 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'routine_builder');
  END IF;

  IF v_streak + 1 >= 7 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'on_fire');
  END IF;

  IF v_streak + 1 >= 14 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'unstoppable');
  END IF;

  IF v_streak + 1 >= 30 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'champion');
  END IF;

  IF v_streak + 1 >= 60 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'iron_will');
  END IF;

  IF v_streak + 1 >= 100 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'legendary_streak');
  END IF;

  PERFORM public.check_and_unlock_achievements(NEW.user_id);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.award_habit_completion_xp()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER award_habit_completion_xp
AFTER INSERT OR UPDATE OF count ON public.habit_logs
FOR EACH ROW
EXECUTE FUNCTION public.award_habit_completion_xp();
