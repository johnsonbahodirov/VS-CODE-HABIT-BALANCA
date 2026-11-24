ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS daily_goal_minutes integer NOT NULL DEFAULT 30 CHECK (daily_goal_minutes BETWEEN 1 AND 1440);

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS daily_goal_minutes integer NOT NULL DEFAULT 120 CHECK (daily_goal_minutes BETWEEN 15 AND 1440),
  ADD COLUMN IF NOT EXISTS pomodoro_focus_minutes integer NOT NULL DEFAULT 25 CHECK (pomodoro_focus_minutes BETWEEN 1 AND 1440),
  ADD COLUMN IF NOT EXISTS pomodoro_short_break_minutes integer NOT NULL DEFAULT 5 CHECK (pomodoro_short_break_minutes BETWEEN 1 AND 1440),
  ADD COLUMN IF NOT EXISTS pomodoro_long_break_minutes integer NOT NULL DEFAULT 15 CHECK (pomodoro_long_break_minutes BETWEEN 1 AND 1440),
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_time time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

WITH duplicate_sessions AS (
  SELECT
    id,
    user_id,
    started_at,
    row_number() OVER (PARTITION BY user_id ORDER BY started_at DESC, id DESC) AS position
  FROM public.work_sessions
  WHERE ended_at IS NULL
)
UPDATE public.work_sessions AS session
SET ended_at = GREATEST(
  duplicate.started_at,
  LEAST(
    COALESCE((
      SELECT min(newer.started_at)
      FROM public.work_sessions AS newer
      WHERE newer.user_id = duplicate.user_id
        AND newer.ended_at IS NULL
        AND (newer.started_at > duplicate.started_at
          OR (newer.started_at = duplicate.started_at AND newer.id > duplicate.id))
    ), now()),
    now()
  )
)
FROM duplicate_sessions AS duplicate
WHERE session.id = duplicate.id AND duplicate.position > 1;

CREATE UNIQUE INDEX work_sessions_one_active_per_user
  ON public.work_sessions (user_id)
  WHERE ended_at IS NULL;

CREATE TABLE public.habit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  day date NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, day)
);
ALTER TABLE public.habit_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_notes TO authenticated;
CREATE POLICY "own habit notes" ON public.habit_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.habits h WHERE h.id = habit_id AND h.user_id = auth.uid()
    )
  );

CREATE TABLE public.achievements (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  reward_xp integer NOT NULL CHECK (reward_xp >= 0),
  sort_order integer NOT NULL
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.achievements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.achievements TO authenticated;
CREATE POLICY "achievements are readable" ON public.achievements FOR SELECT TO authenticated USING (true);

INSERT INTO public.achievements (key, name, description, reward_xp, sort_order) VALUES
  ('first_step', 'First Step', 'Complete your first habit.', 50, 1),
  ('on_fire', 'On Fire', 'Reach a 7-day streak on any habit.', 100, 2),
  ('champion', 'Champion', 'Reach a 30-day streak on any habit.', 300, 3),
  ('perfect_week', 'Perfect Week', 'Complete every habit for 7 days in a row.', 150, 4),
  ('bookworm', 'Bookworm', 'Complete a reading or book habit 50 times.', 200, 5),
  ('legend', 'Legend', 'Reach level 20.', 500, 6)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.user_xp (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp bigint NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_xp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_xp FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_xp TO authenticated;
CREATE POLICY "own xp" ON public.user_xp FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.xp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  habit_id uuid REFERENCES public.habits(id) ON DELETE SET NULL,
  day date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX xp_transactions_user_created_idx ON public.xp_transactions (user_id, created_at DESC);
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.xp_transactions TO authenticated;
CREATE POLICY "own xp transactions" ON public.xp_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.user_achievements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key text NOT NULL REFERENCES public.achievements(key) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_key)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_achievements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_achievements TO authenticated;
CREATE POLICY "own user achievements" ON public.user_achievements FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.reminder_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reminder_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_subscriptions TO authenticated;
GRANT ALL ON public.reminder_subscriptions TO service_role;
CREATE POLICY "own reminder subscriptions" ON public.reminder_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.reminder_deliveries (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
REVOKE ALL ON public.reminder_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reminder_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.xp_for_level(p_level integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_level <= 1 THEN 0::bigint
    ELSE ((p_level - 1) * 150 + 40 * (p_level - 1) * (p_level - 2))::bigint
  END;
$$;

CREATE OR REPLACE FUNCTION public.grant_habit_xp(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_habit_id uuid DEFAULT NULL,
  p_day date DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transaction_id uuid;
BEGIN
  IF p_amount <= 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.xp_transactions (user_id, amount, reason, idempotency_key, habit_id, day)
  VALUES (p_user_id, p_amount, p_reason, p_idempotency_key, p_habit_id, p_day)
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_transaction_id;

  IF v_transaction_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_xp (user_id, total_xp)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET total_xp = public.user_xp.total_xp + EXCLUDED.total_xp,
        updated_at = now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_habit_xp(uuid, integer, text, text, uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.unlock_habit_achievement(p_user_id uuid, p_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reward integer;
  v_unlocked uuid;
BEGIN
  SELECT reward_xp INTO v_reward FROM public.achievements WHERE key = p_key;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_achievements (user_id, achievement_key)
  VALUES (p_user_id, p_key)
  ON CONFLICT (user_id, achievement_key) DO NOTHING
  RETURNING user_id INTO v_unlocked;

  IF v_unlocked IS NULL THEN
    RETURN false;
  END IF;

  PERFORM public.grant_habit_xp(
    p_user_id, v_reward, 'Achievement: ' || p_key, 'achievement:' || p_key, NULL, NULL
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_habit_achievement(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.award_habit_completion_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_today date;
  v_streak integer := 0;
  v_offset integer;
  v_total_xp bigint;
  v_has_habits boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.habits h
    WHERE h.id = NEW.habit_id AND h.user_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT timezone INTO v_timezone FROM public.user_settings WHERE user_id = NEW.user_id;
  IF v_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
  ) THEN
    v_timezone := 'UTC';
  END IF;
  v_today := (now() AT TIME ZONE v_timezone)::date;

  -- Historical edits remain valid log entries but never create retroactive rewards.
  IF NEW.day <> v_today THEN
    RETURN NEW;
  END IF;

  PERFORM public.grant_habit_xp(
    NEW.user_id, 20, 'Habit completion', 'completion:' || NEW.habit_id || ':' || NEW.day,
    NEW.habit_id, NEW.day
  );

  FOR v_offset IN 1..30 LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.habit_logs l
      WHERE l.habit_id = NEW.habit_id AND l.user_id = NEW.user_id
        AND l.day = NEW.day - v_offset
    );
    v_streak := v_streak + 1;
  END LOOP;

  IF v_streak + 1 IN (3, 7, 30) THEN
    PERFORM public.grant_habit_xp(
      NEW.user_id,
      CASE v_streak + 1 WHEN 3 THEN 30 WHEN 7 THEN 100 WHEN 30 THEN 300 END,
      (v_streak + 1)::text || '-day habit streak',
      'streak:' || NEW.habit_id || ':' || (v_streak + 1),
      NEW.habit_id, NEW.day
    );
  END IF;

  IF EXISTS (SELECT 1 FROM public.habit_logs WHERE user_id = NEW.user_id) THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'first_step');
  END IF;
  IF v_streak + 1 >= 7 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'on_fire');
  END IF;
  IF v_streak + 1 >= 30 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'champion');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.habits WHERE user_id = NEW.user_id) INTO v_has_habits;
  IF v_has_habits AND NOT EXISTS (
    SELECT 1
    FROM public.habits h
    CROSS JOIN generate_series(0, 6) AS days(day_offset)
    WHERE h.user_id = NEW.user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.habit_logs l
        WHERE l.habit_id = h.id AND l.user_id = NEW.user_id
          AND l.day = NEW.day - days.day_offset
      )
  ) THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'perfect_week');
  END IF;

  IF (
    SELECT count(*)
    FROM public.habit_logs l
    JOIN public.habits h ON h.id = l.habit_id
    WHERE l.user_id = NEW.user_id
      AND (lower(h.name) LIKE '%read%' OR lower(h.name) LIKE '%book%'
        OR lower(h.category) LIKE '%read%' OR lower(h.category) LIKE '%book%')
  ) >= 50 THEN
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

CREATE TRIGGER award_habit_completion_xp
AFTER INSERT ON public.habit_logs
FOR EACH ROW EXECUTE FUNCTION public.award_habit_completion_xp();

COMMENT ON TABLE public.xp_transactions IS 'Append-only XP ledger; rows are written only by trusted database functions.';
COMMENT ON TABLE public.habit_notes IS 'Private day notes for each habit.';
COMMENT ON TABLE public.reminder_subscriptions IS 'Web Push subscriptions owned by each authenticated user.';
