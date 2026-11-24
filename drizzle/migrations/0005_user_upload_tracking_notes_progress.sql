CREATE TABLE public.day_notes (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  day date NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_notes TO authenticated;
GRANT ALL ON public.day_notes TO service_role;
ALTER TABLE public.day_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own day notes" ON public.day_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS tracking_type text NOT NULL DEFAULT 'yes_no' CHECK (tracking_type IN ('yes_no', 'count')),
  ADD COLUMN IF NOT EXISTS daily_goal_count integer NOT NULL DEFAULT 1 CHECK (daily_goal_count BETWEEN 1 AND 999);
ALTER TABLE public.habit_logs
  ADD COLUMN IF NOT EXISTS count integer NOT NULL DEFAULT 1 CHECK (count BETWEEN 1 AND 999);
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekdays', 'selected_days', 'custom')),
  ADD COLUMN IF NOT EXISTS schedule_days integer[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_time time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.habits ADD CONSTRAINT habits_schedule_days_valid
  CHECK (cardinality(schedule_days) > 0 AND schedule_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]);
ALTER TABLE public.work_sessions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'stopwatch' CHECK (mode IN ('stopwatch', 'pomodoro'));

CREATE TABLE public.habit_reminder_deliveries (
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  day date NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (habit_id, day)
);
REVOKE ALL ON public.habit_reminder_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.habit_reminder_deliveries TO service_role;
ALTER TABLE public.habit_reminder_deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'common' CHECK (tier IN ('common', 'rare', 'epic', 'legendary'));
ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_featured_achievement(p_achievement_key text, p_featured boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_featured_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to update showcased achievements.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  IF p_featured THEN
    SELECT count(*) INTO v_featured_count FROM public.user_achievements
    WHERE user_id = v_user_id AND is_featured;
    IF v_featured_count >= 3 AND NOT EXISTS (
      SELECT 1 FROM public.user_achievements
      WHERE user_id = v_user_id AND achievement_key = p_achievement_key AND is_featured
    ) THEN
      RAISE EXCEPTION 'You can showcase up to 3 achievements.';
    END IF;
    UPDATE public.user_achievements SET is_featured = true
    WHERE user_id = v_user_id AND achievement_key = p_achievement_key;
  ELSE
    UPDATE public.user_achievements SET is_featured = false
    WHERE user_id = v_user_id AND achievement_key = p_achievement_key;
  END IF;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_featured_achievement(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_featured_achievement(text, boolean) TO authenticated;

UPDATE public.achievements SET tier = CASE key
  WHEN 'first_step' THEN 'common' WHEN 'on_fire' THEN 'rare' WHEN 'bookworm' THEN 'rare'
  WHEN 'perfect_week' THEN 'epic' WHEN 'champion' THEN 'epic' WHEN 'legend' THEN 'legendary'
  ELSE tier END;

CREATE OR REPLACE FUNCTION public.award_habit_completion_xp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_today date;
  v_streak integer := 0;
  v_offset integer;
  v_total_xp bigint;
  v_has_habits boolean;
  v_goal_count integer;
BEGIN
  SELECT daily_goal_count INTO v_goal_count FROM public.habits
  WHERE id = NEW.habit_id AND user_id = NEW.user_id AND NOT is_paused AND archived_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.count < v_goal_count THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.count >= v_goal_count THEN RETURN NEW; END IF;

  SELECT timezone INTO v_timezone FROM public.user_settings WHERE user_id = NEW.user_id;
  IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN
    v_timezone := 'UTC';
  END IF;
  v_today := (now() AT TIME ZONE v_timezone)::date;
  IF NEW.day <> v_today THEN RETURN NEW; END IF;

  PERFORM public.grant_habit_xp(NEW.user_id, 20, 'Habit completion',
    'completion:' || NEW.habit_id || ':' || NEW.day, NEW.habit_id, NEW.day);

  FOR v_offset IN 1..365 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.habits h WHERE h.id = NEW.habit_id AND CASE
        WHEN h.frequency = 'daily' THEN true
        WHEN h.frequency = 'weekdays' THEN EXTRACT(DOW FROM NEW.day - v_offset)::integer BETWEEN 1 AND 5
        ELSE EXTRACT(DOW FROM NEW.day - v_offset)::integer = ANY(h.schedule_days) END
    ) THEN CONTINUE; END IF;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.habit_logs l JOIN public.habits h ON h.id = l.habit_id
      WHERE l.habit_id = NEW.habit_id AND l.user_id = NEW.user_id
        AND l.day = NEW.day - v_offset AND l.count >= h.daily_goal_count
    );
    v_streak := v_streak + 1;
  END LOOP;

  IF v_streak + 1 IN (3, 7, 30) THEN
    PERFORM public.grant_habit_xp(NEW.user_id,
      CASE v_streak + 1 WHEN 3 THEN 30 WHEN 7 THEN 100 WHEN 30 THEN 300 END,
      (v_streak + 1)::text || '-day habit streak',
      'streak:' || NEW.habit_id || ':' || (v_streak + 1), NEW.habit_id, NEW.day);
  END IF;

  IF EXISTS (SELECT 1 FROM public.habit_logs l JOIN public.habits h ON h.id = l.habit_id
    WHERE l.user_id = NEW.user_id AND l.count >= h.daily_goal_count) THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'first_step');
  END IF;
  IF v_streak + 1 >= 7 THEN PERFORM public.unlock_habit_achievement(NEW.user_id, 'on_fire'); END IF;
  IF v_streak + 1 >= 30 THEN PERFORM public.unlock_habit_achievement(NEW.user_id, 'champion'); END IF;

  SELECT EXISTS (SELECT 1 FROM public.habits
    WHERE user_id = NEW.user_id AND NOT is_paused AND archived_at IS NULL) INTO v_has_habits;
  IF v_has_habits AND EXISTS (
    SELECT 1 FROM public.habits h
    CROSS JOIN generate_series(date_trunc('week', NEW.day::timestamp)::date,
      date_trunc('week', NEW.day::timestamp)::date + 6, interval '1 day') AS days(day)
    WHERE h.user_id = NEW.user_id AND NOT h.is_paused AND h.archived_at IS NULL
      AND days.day::date >= h.created_at::date
      AND CASE WHEN h.frequency = 'daily' THEN true
        WHEN h.frequency = 'weekdays' THEN EXTRACT(DOW FROM days.day::date)::integer BETWEEN 1 AND 5
        ELSE EXTRACT(DOW FROM days.day::date)::integer = ANY(h.schedule_days) END
  ) AND NOT EXISTS (
    SELECT 1 FROM public.habits h
    CROSS JOIN generate_series(date_trunc('week', NEW.day::timestamp)::date,
      date_trunc('week', NEW.day::timestamp)::date + 6, interval '1 day') AS days(day)
    WHERE h.user_id = NEW.user_id AND NOT h.is_paused AND h.archived_at IS NULL
      AND days.day::date >= h.created_at::date
      AND CASE WHEN h.frequency = 'daily' THEN true
        WHEN h.frequency = 'weekdays' THEN EXTRACT(DOW FROM days.day::date)::integer BETWEEN 1 AND 5
        ELSE EXTRACT(DOW FROM days.day::date)::integer = ANY(h.schedule_days) END
      AND NOT EXISTS (SELECT 1 FROM public.habit_logs l
        WHERE l.habit_id = h.id AND l.user_id = NEW.user_id
          AND l.day = days.day::date AND l.count >= h.daily_goal_count)
  ) THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'perfect_week');
    PERFORM public.grant_habit_xp(NEW.user_id, 50, 'Weekly habit goal',
      'weekly-goal:' || date_trunc('week', NEW.day::timestamp)::date, NULL, NEW.day);
  END IF;

  IF (SELECT count(*) FROM public.habit_logs l JOIN public.habits h ON h.id = l.habit_id
    WHERE l.user_id = NEW.user_id AND l.count >= h.daily_goal_count
      AND (lower(h.name) LIKE '%read%' OR lower(h.name) LIKE '%book%'
        OR lower(h.category) LIKE '%read%' OR lower(h.category) LIKE '%book%')) >= 50 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'bookworm');
  END IF;

  SELECT total_xp INTO v_total_xp FROM public.user_xp WHERE user_id = NEW.user_id;
  IF v_total_xp >= public.xp_for_level(20) THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'legend');
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.award_habit_completion_xp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS award_habit_completion_xp ON public.habit_logs;
CREATE TRIGGER award_habit_completion_xp AFTER INSERT OR UPDATE OF count ON public.habit_logs
FOR EACH ROW EXECUTE FUNCTION public.award_habit_completion_xp();

CREATE OR REPLACE FUNCTION public.award_first_habit_xp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.xp_transactions
    WHERE user_id = NEW.user_id AND idempotency_key = 'first-habit:' || NEW.user_id) THEN
    PERFORM public.grant_habit_xp(NEW.user_id, 10, 'First habit created',
      'first-habit:' || NEW.user_id, NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.award_first_habit_xp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS award_first_habit_xp ON public.habits;
CREATE TRIGGER award_first_habit_xp AFTER INSERT ON public.habits
FOR EACH ROW EXECUTE FUNCTION public.award_first_habit_xp();

CREATE OR REPLACE FUNCTION public.award_focus_session_xp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_timezone text;
BEGIN
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL
    AND NEW.ended_at - NEW.started_at >= interval '1 minute' THEN
    SELECT timezone INTO v_timezone FROM public.user_settings WHERE user_id = NEW.user_id;
    IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN
      v_timezone := 'UTC';
    END IF;
    PERFORM public.grant_habit_xp(NEW.user_id, 5, 'Focus session completed',
      'focus-session:' || NEW.id, NEW.habit_id, (NEW.ended_at AT TIME ZONE v_timezone)::date);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.award_focus_session_xp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS award_focus_session_xp ON public.work_sessions;
CREATE TRIGGER award_focus_session_xp AFTER UPDATE OF ended_at ON public.work_sessions
FOR EACH ROW EXECUTE FUNCTION public.award_focus_session_xp();