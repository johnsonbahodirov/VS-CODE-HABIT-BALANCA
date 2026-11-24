-- ===== drizzle/migrations/0000_migration.sql =====
CREATE TABLE public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT 'green',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT ALL ON public.habits TO service_role;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own habits" ON public.habits FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.habit_logs (
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  day date NOT NULL,
  PRIMARY KEY (habit_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_logs TO authenticated;
GRANT ALL ON public.habit_logs TO service_role;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs" ON public.habit_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_sessions TO authenticated;
GRANT ALL ON public.work_sessions TO service_role;
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.work_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  daily_target_minutes int NOT NULL DEFAULT 480
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- ===== drizzle/migrations/0001_habit_category_icon_session_habit.sql =====
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Health';
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT 'sparkles';
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS habit_id uuid REFERENCES public.habits(id) ON DELETE SET NULL;
COMMENT ON TABLE public.user_settings IS 'DEPRECATED: daily work target removed';
-- ===== drizzle/migrations/0002_progress_gamification.sql =====
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

-- ===== drizzle/migrations/0003_friends.sql =====
CREATE TABLE public.social_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_code text NOT NULL UNIQUE CHECK (friend_code ~ '^[0-9]{6}$'),
  display_name text NOT NULL DEFAULT 'Learner'
    CHECK (char_length(display_name) BETWEEN 1 AND 32),
  share_progress boolean NOT NULL DEFAULT false,
  share_presence boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX friend_requests_pair_unique
  ON public.friend_requests (
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id)
  );
CREATE INDEX friend_requests_incoming_idx
  ON public.friend_requests (addressee_id, created_at DESC)
  WHERE status = 'pending';

CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE public.social_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.friend_code_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX friend_code_attempts_user_time_idx
  ON public.friend_code_attempts (user_id, attempted_at DESC);

ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_profiles, public.friend_requests, public.user_blocks,
  public.social_presence, public.friend_code_attempts
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_social_profile(p_user_id uuid, p_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
  v_name text;
  v_attempt integer;
BEGIN
  IF p_user_id IS NULL OR EXISTS (
    SELECT 1 FROM public.social_profiles WHERE user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  v_name := left(NULLIF(btrim(p_name), ''), 32);
  IF v_name IS NULL THEN
    v_name := 'Learner';
  END IF;

  FOR v_attempt IN 1..100 LOOP
    v_code := (floor(random() * 900000) + 100000)::integer::text;
    INSERT INTO public.social_profiles (user_id, friend_code, display_name)
    VALUES (p_user_id, v_code, v_name)
    ON CONFLICT DO NOTHING;
    IF EXISTS (SELECT 1 FROM public.social_profiles WHERE user_id = p_user_id) THEN
      RETURN;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Could not allocate a unique friend code.';
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_social_profile(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_social_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.ensure_social_profile(
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name')
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_social_profile_for_new_user() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT id, COALESCE(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name') AS name
    FROM auth.users
  LOOP
    PERFORM public.ensure_social_profile(v_user.id, v_user.name);
  END LOOP;
END;
$$;

CREATE TRIGGER create_social_profile_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_social_profile_for_new_user();

CREATE OR REPLACE FUNCTION public.update_social_settings(
  p_display_name text,
  p_share_progress boolean,
  p_share_presence boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_display_name);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 32 characters.';
  END IF;
  IF p_share_progress IS NULL OR p_share_presence IS NULL THEN
    RAISE EXCEPTION 'Sharing choices are required.';
  END IF;

  PERFORM public.ensure_social_profile(v_user_id);
  UPDATE public.social_profiles
  SET display_name = v_name,
      share_progress = p_share_progress,
      share_presence = p_share_presence,
      updated_at = now()
  WHERE user_id = v_user_id;

  IF NOT p_share_presence THEN
    DELETE FROM public.social_presence WHERE user_id = v_user_id;
  ELSE
    INSERT INTO public.social_presence (user_id, last_seen_at)
    VALUES (v_user_id, now())
    ON CONFLICT (user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_friend_request(p_friend_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_id uuid;
  v_request public.friend_requests%ROWTYPE;
  v_attempts integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF p_friend_code IS NULL OR p_friend_code !~ '^[0-9]{6}$' THEN
    RETURN 'invalid_code';
  END IF;

  INSERT INTO public.friend_code_attempts (user_id) VALUES (v_user_id);
  DELETE FROM public.friend_code_attempts
  WHERE user_id = v_user_id AND attempted_at < now() - interval '1 day';
  SELECT count(*) INTO v_attempts
  FROM public.friend_code_attempts
  WHERE user_id = v_user_id AND attempted_at > now() - interval '1 hour';
  IF v_attempts > 20 THEN
    RETURN 'rate_limited';
  END IF;

  SELECT user_id INTO v_target_id
  FROM public.social_profiles
  WHERE friend_code = p_friend_code;
  IF v_target_id IS NULL THEN
    RETURN 'not_found';
  END IF;
  IF v_target_id = v_user_id THEN
    RETURN 'self';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = v_user_id AND blocked_id = v_target_id)
       OR (blocker_id = v_target_id AND blocked_id = v_user_id)
  ) THEN
    RETURN 'blocked';
  END IF;

  SELECT * INTO v_request
  FROM public.friend_requests
  WHERE (requester_id = v_user_id AND addressee_id = v_target_id)
     OR (requester_id = v_target_id AND addressee_id = v_user_id)
  FOR UPDATE;

  IF FOUND THEN
    IF v_request.status = 'accepted' THEN
      RETURN 'already_friends';
    END IF;
    IF v_request.status = 'pending' AND v_request.requester_id = v_user_id THEN
      RETURN 'request_pending';
    END IF;
    IF v_request.status = 'pending' THEN
      UPDATE public.friend_requests
      SET status = 'accepted', updated_at = now()
      WHERE id = v_request.id;
      RETURN 'accepted';
    END IF;

    UPDATE public.friend_requests
    SET requester_id = v_user_id,
        addressee_id = v_target_id,
        status = 'pending',
        created_at = now(),
        updated_at = now()
    WHERE id = v_request.id;
    RETURN 'sent';
  END IF;

  INSERT INTO public.friend_requests (requester_id, addressee_id)
  VALUES (v_user_id, v_target_id);
  RETURN 'sent';
END;
$$;

CREATE OR REPLACE FUNCTION public.block_friend(p_friend_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  SELECT profile.user_id INTO v_target_id
  FROM public.social_profiles profile
  WHERE profile.friend_code = p_friend_code
    AND EXISTS (
      SELECT 1
      FROM public.friend_requests request
      WHERE request.status IN ('pending', 'accepted')
        AND ((request.requester_id = v_user_id AND request.addressee_id = profile.user_id)
          OR (request.addressee_id = v_user_id AND request.requester_id = profile.user_id))
    );
  IF v_target_id IS NULL OR v_target_id = v_user_id THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (v_user_id, v_target_id)
  ON CONFLICT DO NOTHING;
  DELETE FROM public.friend_requests
  WHERE (requester_id = v_user_id AND addressee_id = v_target_id)
     OR (requester_id = v_target_id AND addressee_id = v_user_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_friend(p_friend_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  DELETE FROM public.user_blocks blocker
  USING public.social_profiles profile
  WHERE blocker.blocker_id = v_user_id
    AND blocker.blocked_id = profile.user_id
    AND profile.friend_code = p_friend_code;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(p_request_id uuid, p_accept boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'Choose whether to accept the request.';
  END IF;

  UPDATE public.friend_requests
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
      updated_at = now()
  WHERE id = p_request_id
    AND addressee_id = v_user_id
    AND status = 'pending'
  RETURNING status INTO v_status;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  SELECT profile.user_id INTO v_target_id
  FROM public.social_profiles profile
  JOIN public.friend_requests request
    ON request.status = 'accepted'
   AND ((request.requester_id = v_user_id AND request.addressee_id = profile.user_id)
     OR (request.addressee_id = v_user_id AND request.requester_id = profile.user_id))
  WHERE profile.friend_code = p_friend_code;
  IF v_target_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.friend_requests
  WHERE status = 'accepted'
    AND ((requester_id = v_user_id AND addressee_id = v_target_id)
      OR (addressee_id = v_user_id AND requester_id = v_target_id));
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_social_presence(p_online boolean DEFAULT true)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_sharing boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT share_presence INTO v_sharing
  FROM public.social_profiles
  WHERE user_id = v_user_id;
  IF p_online AND COALESCE(v_sharing, false) THEN
    INSERT INTO public.social_presence (user_id, last_seen_at)
    VALUES (v_user_id, now())
    ON CONFLICT (user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;
  ELSE
    DELETE FROM public.social_presence WHERE user_id = v_user_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_social_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  PERFORM public.ensure_social_profile(v_user_id);

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'friend_code', profile.friend_code,
        'display_name', profile.display_name,
        'share_progress', profile.share_progress,
        'share_presence', profile.share_presence
      )
      FROM public.social_profiles profile
      WHERE profile.user_id = v_user_id
    ),
    'incoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'request_id', request.id,
        'friend_code', profile.friend_code,
        'display_name', profile.display_name,
        'created_at', request.created_at
      ) ORDER BY request.created_at DESC)
      FROM public.friend_requests request
      JOIN public.social_profiles profile ON profile.user_id = request.requester_id
      WHERE request.addressee_id = v_user_id AND request.status = 'pending'
    ), '[]'::jsonb),
    'outgoing', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'friend_code', profile.friend_code,
        'display_name', profile.display_name,
        'created_at', request.created_at
      ) ORDER BY request.created_at DESC)
      FROM public.friend_requests request
      JOIN public.social_profiles profile ON profile.user_id = request.addressee_id
      WHERE request.requester_id = v_user_id AND request.status = 'pending'
    ), '[]'::jsonb),
    'blocked', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'friend_code', profile.friend_code,
        'display_name', profile.display_name
      ) ORDER BY lower(profile.display_name))
      FROM public.user_blocks blocker
      JOIN public.social_profiles profile ON profile.user_id = blocker.blocked_id
      WHERE blocker.blocker_id = v_user_id
    ), '[]'::jsonb),
    'friends', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'friend_code', profile.friend_code,
        'display_name', profile.display_name,
        'share_progress', profile.share_progress,
        'share_presence', profile.share_presence,
        'is_online', profile.share_presence
          AND COALESCE(presence.last_seen_at > now() - interval '2 minutes', false),
        'current_habit', CASE
          WHEN profile.share_presence
            AND presence.last_seen_at > now() - interval '2 minutes'
          THEN (
            SELECT habit.name
            FROM public.work_sessions session
            JOIN public.habits habit ON habit.id = session.habit_id
            WHERE session.user_id = profile.user_id AND session.ended_at IS NULL
            ORDER BY session.started_at DESC
            LIMIT 1
          )
          ELSE NULL
        END,
        'total_xp', CASE WHEN profile.share_progress THEN COALESCE(xp.total_xp, 0) ELSE NULL END,
        'level', CASE WHEN profile.share_progress THEN (
          SELECT COALESCE(max(levels.number), 1)
          FROM generate_series(1, 100) AS levels(number)
          WHERE COALESCE(xp.total_xp, 0) >= public.xp_for_level(levels.number)
        ) ELSE NULL END,
        'top_habits', CASE WHEN profile.share_progress THEN COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', completed.name,
            'completions', completed.completions
          ) ORDER BY completed.completions DESC, completed.name)
          FROM (
            SELECT habit.name, count(*)::integer AS completions
            FROM public.habit_logs log
            JOIN public.habits habit ON habit.id = log.habit_id
            WHERE log.user_id = profile.user_id
            GROUP BY habit.id, habit.name
            ORDER BY count(*) DESC, habit.name
            LIMIT 3
          ) completed
        ), '[]'::jsonb) ELSE NULL END,
        'friend_since', request.created_at
      ) ORDER BY lower(profile.display_name), profile.friend_code)
      FROM public.friend_requests request
      JOIN public.social_profiles profile
        ON profile.user_id = CASE
          WHEN request.requester_id = v_user_id THEN request.addressee_id
          ELSE request.requester_id
        END
      LEFT JOIN public.social_presence presence ON presence.user_id = profile.user_id
      LEFT JOIN public.user_xp xp ON xp.user_id = profile.user_id
      WHERE request.status = 'accepted'
        AND (request.requester_id = v_user_id OR request.addressee_id = v_user_id)
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

DO $$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT oid::regprocedure AS signature
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (
        'update_social_settings', 'send_friend_request', 'respond_friend_request',
        'remove_friend', 'block_friend', 'unblock_friend',
        'heartbeat_social_presence', 'get_social_overview'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_function.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_function.signature);
  END LOOP;
END;
$$;

COMMENT ON TABLE public.social_profiles IS
  'Friend lookup codes and opt-in sharing preferences; access only through scoped security-definer RPCs.';
COMMENT ON TABLE public.social_presence IS
  'Heartbeat timestamps, visible to accepted friends only when the owner opts in.';
COMMENT ON TABLE public.user_blocks IS
  'User-controlled block list; blocked accounts cannot send new friend requests.';
COMMENT ON TABLE public.friend_code_attempts IS
  'Rate-limit friend-code lookups to reduce enumeration and request spam.';

-- ===== drizzle/migrations/0004_migration.sql =====
SELECT 1;
-- ===== drizzle/migrations/0005_user_upload_tracking_notes_progress.sql =====
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
-- ===== drizzle/migrations/0006_performance_indexes.sql =====
-- Speeds up the per-user history queries used by Today, Habits and Stats.
-- Add-only and idempotent: safe to run more than once, touches no rows.
CREATE INDEX IF NOT EXISTS habit_logs_user_day_idx
  ON public.habit_logs (user_id, day DESC);

CREATE INDEX IF NOT EXISTS work_sessions_user_started_idx
  ON public.work_sessions (user_id, started_at DESC);

-- ===== drizzle/migrations/0007_xp_day_and_notes_indexes.sql =====
-- Speeds up range-based XP stats queries and habit notes lookups.
-- Add-only and idempotent: safe to run more than once, touches no rows.
CREATE INDEX IF NOT EXISTS xp_transactions_user_day_idx
  ON public.xp_transactions (user_id, day DESC);

CREATE INDEX IF NOT EXISTS habit_notes_user_day_idx
  ON public.habit_notes (user_id, day DESC);

-- ===== drizzle/migrations/0008_balance_achievement_system.sql =====
-- Migration 0008: Balance Achievement System
-- Comprehensive 32+ achievements, 6 categories, comeback tracking, and tier support

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'getting_started';

-- Seed the full official achievement catalog
INSERT INTO public.achievements (key, name, description, reward_xp, sort_order, tier, category)
VALUES
  -- Getting Started
  ('first_step', 'First Step', 'Birinchi odatni bir marta muvaffaqiyatli bajarish.', 10, 1, 'common', 'getting_started'),
  ('getting_started', 'Getting Started', 'Jami 3 ta habit completion bajarish.', 40, 2, 'common', 'getting_started'),
  ('early_bird', 'Early Bird', 'Ertalab rejalashtirilgan odatni 5 marta bajarish.', 70, 3, 'common', 'getting_started'),
  ('first_five', 'First Five', 'Kamida 5 ta turli odat yaratish.', 100, 4, 'common', 'getting_started'),
  ('routine_builder', 'Routine Builder', '3 kun ketma-ket kamida bitta rejalashtirilgan odatni bajarish.', 50, 5, 'rare', 'getting_started'),
  ('first_ten', 'First Ten', 'Barcha odatlar bo''yicha jami 10 ta habit completion.', 100, 6, 'common', 'getting_started'),

  -- Consistency
  ('on_fire', 'On Fire', 'Bitta odatda 7 kunlik streak hosil qilish.', 50, 7, 'rare', 'consistency'),
  ('perfect_week', 'Perfect Week', '7 kun davomida har kuni rejalashtirilgan barcha odatlarni bajarish.', 100, 8, 'epic', 'consistency'),
  ('unstoppable', 'Unstoppable', 'Bitta odatda 14 kunlik streak hosil qilish.', 150, 9, 'epic', 'consistency'),
  ('champion', 'Champion', 'Bitta odatda 30 kunlik streak hosil qilish.', 250, 10, 'epic', 'consistency'),
  ('iron_will', 'Iron Will', 'Bitta odatda 60 kunlik streak hosil qilish.', 600, 11, 'legendary', 'consistency'),
  ('legendary_streak', 'Legendary', 'Bitta odatda 100 kunlik streak hosil qilish.', 1000, 12, 'legendary', 'consistency'),

  -- Discipline
  ('consistency_pro', 'Consistency Pro', 'Jami har bir odatdan 100 ta completion to''plash.', 100, 13, 'rare', 'discipline'),
  ('discipline_master', 'Discipline Master', 'Jami 500 ta habit completion to''plash.', 600, 14, 'epic', 'discipline'),
  ('perfectionist', 'Perfectionist', '30 kunlik davrda rejalashtirilgan odatlarning kamida 90 foizini bajarish.', 500, 15, 'epic', 'discipline'),
  ('dedicated', 'Dedicated', 'Jami 1 000 ta habit completion to''plash.', 1000, 16, 'legendary', 'discipline'),
  ('unbreakable', 'Unbreakable', 'Ilovada 365 xil kunda kamida bittadan odat bajarish.', 2000, 17, 'legendary', 'discipline'),

  -- Growth
  ('bookworm', 'Bookworm', 'Reading turidagi odatni 10 marta bajarish.', 100, 18, 'common', 'growth'),
  ('knowledge_seeker', 'Knowledge Seeker', 'Learning turidagi odatni 25 marta bajarish.', 150, 19, 'rare', 'growth'),
  ('fast_learner', 'Fast Learner', 'Learning odatini 7 kunlik streak bilan bajarish.', 150, 20, 'rare', 'growth'),
  ('fitness_freak', 'Fitness Freak', 'Workout/Fitness turidagi odatni 30 marta bajarish.', 200, 21, 'epic', 'growth'),

  -- Resilience
  ('comeback', 'Comeback', 'Kamida 7 kunlik nofaollikdan so''ng odatni qayta bajarish.', 100, 22, 'common', 'resilience'),
  ('second_chance', 'Second Chance', 'Qaytishdan keyin 7 kunlik streak hosil qilish.', 200, 23, 'rare', 'resilience'),
  ('never_give_up', 'Never Give Up', 'Uch marta alohida comeback siklini muvaffaqiyatli yakunlash.', 350, 24, 'epic', 'resilience'),
  ('stronger_again', 'Stronger Again', 'Comebackdan keyin 30 kunlik streak hosil qilish.', 500, 25, 'epic', 'resilience'),
  ('survivor', 'Survivor', 'Comebackdan keyin 90 kun kunda faol bo''lish.', 800, 26, 'legendary', 'resilience'),

  -- Milestones
  ('rising_star', 'Rising Star', 'Jami 500 XP to''plash.', 100, 27, 'common', 'milestones'),
  ('elite', 'Elite', 'Jami 2 000 XP to''plash.', 250, 28, 'rare', 'milestones'),
  ('high_achiever', 'High Achiever', 'Jami 5 000 XP to''plash.', 500, 29, 'epic', 'milestones'),
  ('level_10', 'Level 10', '10-darajaga chiqish.', 200, 30, 'rare', 'milestones'),
  ('level_20', 'Level 20', '20-darajaga chiqish.', 400, 31, 'epic', 'milestones'),
  ('ultimate_achiever', 'Ultimate Achiever', '50-darajaga chiqish.', 900, 32, 'legendary', 'milestones'),
  ('legend', 'Legend', 'Reach level 20.', 500, 33, 'epic', 'milestones')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  reward_xp = EXCLUDED.reward_xp,
  sort_order = EXCLUDED.sort_order,
  tier = EXCLUDED.tier,
  category = EXCLUDED.category;

-- Idempotent achievement evaluator function
CREATE OR REPLACE FUNCTION public.check_and_unlock_achievements(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_completions integer := 0;
  v_unique_days integer := 0;
  v_max_streak integer := 0;
  v_habits_count integer := 0;
  v_reading_count integer := 0;
  v_learning_count integer := 0;
  v_workout_count integer := 0;
  v_morning_count integer := 0;
  v_total_xp bigint := 0;
  v_level integer := 1;
BEGIN
  -- Count completed habits
  SELECT count(*) INTO v_total_completions
  FROM public.habit_logs l
  JOIN public.habits h ON h.id = l.habit_id
  WHERE l.user_id = p_user_id
    AND (CASE WHEN h.tracking_type = 'count' THEN l.count >= h.daily_goal_count ELSE l.count >= 1 END);

  -- Count habits created
  SELECT count(*) INTO v_habits_count
  FROM public.habits
  WHERE user_id = p_user_id AND archived_at IS NULL;

  -- Count unique days active
  SELECT count(DISTINCT l.day) INTO v_unique_days
  FROM public.habit_logs l
  WHERE l.user_id = p_user_id AND l.count >= 1;

  -- Category counts
  SELECT count(*) INTO v_reading_count
  FROM public.habit_logs l
  JOIN public.habits h ON h.id = l.habit_id
  WHERE l.user_id = p_user_id AND l.count >= 1
    AND (lower(h.name) LIKE '%read%' OR lower(h.name) LIKE '%book%' OR lower(h.category) LIKE '%read%');

  SELECT count(*) INTO v_learning_count
  FROM public.habit_logs l
  JOIN public.habits h ON h.id = l.habit_id
  WHERE l.user_id = p_user_id AND l.count >= 1
    AND (lower(h.name) LIKE '%learn%' OR lower(h.name) LIKE '%study%' OR lower(h.category) LIKE '%learn%');

  SELECT count(*) INTO v_workout_count
  FROM public.habit_logs l
  JOIN public.habits h ON h.id = l.habit_id
  WHERE l.user_id = p_user_id AND l.count >= 1
    AND (lower(h.name) LIKE '%workout%' OR lower(h.name) LIKE '%gym%' OR lower(h.name) LIKE '%run%'
         OR lower(h.category) LIKE '%fitness%' OR lower(h.category) LIKE '%workout%');

  SELECT count(*) INTO v_morning_count
  FROM public.habit_logs l
  JOIN public.habits h ON h.id = l.habit_id
  WHERE l.user_id = p_user_id AND l.count >= 1
    AND (lower(h.name) LIKE '%morning%' OR lower(coalesce(h.description, '')) LIKE '%morning%');

  -- Getting started unlocks
  IF v_total_completions >= 1 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'first_step'); END IF;
  IF v_total_completions >= 3 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'getting_started'); END IF;
  IF v_total_completions >= 10 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'first_ten'); END IF;
  IF v_habits_count >= 5 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'first_five'); END IF;
  IF v_morning_count >= 5 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'early_bird'); END IF;

  -- Discipline unlocks
  IF v_total_completions >= 100 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'consistency_pro'); END IF;
  IF v_total_completions >= 500 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'discipline_master'); END IF;
  IF v_total_completions >= 1000 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'dedicated'); END IF;
  IF v_unique_days >= 365 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'unbreakable'); END IF;

  -- Growth unlocks
  IF v_reading_count >= 10 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'bookworm'); END IF;
  IF v_learning_count >= 25 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'knowledge_seeker'); END IF;
  IF v_workout_count >= 30 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'fitness_freak'); END IF;

  -- Milestones unlocks based on XP and Level
  SELECT coalesce(total_xp, 0) INTO v_total_xp FROM public.user_xp WHERE user_id = p_user_id;
  IF v_total_xp >= 500 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'rising_star'); END IF;
  IF v_total_xp >= 2000 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'elite'); END IF;
  IF v_total_xp >= 5000 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'high_achiever'); END IF;

  -- Compute current level
  WHILE v_level < 100 AND v_total_xp >= public.xp_for_level(v_level + 1) LOOP
    v_level := v_level + 1;
  END LOOP;

  IF v_level >= 10 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'level_10'); END IF;
  IF v_level >= 20 THEN
    PERFORM public.unlock_habit_achievement(p_user_id, 'level_20');
    PERFORM public.unlock_habit_achievement(p_user_id, 'legend');
  END IF;
  IF v_level >= 50 THEN PERFORM public.unlock_habit_achievement(p_user_id, 'ultimate_achiever'); END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.check_and_unlock_achievements(uuid) FROM PUBLIC, anon, authenticated;

-- Upgrade habit completion trigger to check streaks and comeback
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
  v_prev_active_day date;
  v_days_inactive integer;
  v_tracking_type text;
  v_goal_count integer;
  v_is_complete boolean;
BEGIN
  -- Verify habit ownership and fetch goal type
  SELECT tracking_type, daily_goal_count INTO v_tracking_type, v_goal_count
  FROM public.habits
  WHERE id = NEW.habit_id AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_is_complete := CASE WHEN v_tracking_type = 'count' THEN NEW.count >= v_goal_count ELSE NEW.count >= 1 END;
  IF NOT v_is_complete THEN
    RETURN NEW;
  END IF;

  SELECT timezone INTO v_timezone FROM public.user_settings WHERE user_id = NEW.user_id;
  IF v_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
  ) THEN
    v_timezone := 'UTC';
  END IF;
  v_today := (now() AT TIME ZONE v_timezone)::date;

  IF NEW.day <> v_today THEN
    RETURN NEW;
  END IF;

  -- Grant habit completion XP (idempotent)
  PERFORM public.grant_habit_xp(
    NEW.user_id, 20, 'Habit completion', 'completion:' || NEW.habit_id || ':' || NEW.day,
    NEW.habit_id, NEW.day
  );

  -- Check previous active completion day to detect Comeback (gap >= 7 days)
  SELECT max(day) INTO v_prev_active_day
  FROM public.habit_logs
  WHERE user_id = NEW.user_id AND day < NEW.day AND count >= 1;

  IF v_prev_active_day IS NOT NULL THEN
    v_days_inactive := NEW.day - v_prev_active_day;
    IF v_days_inactive >= 7 THEN
      PERFORM public.unlock_habit_achievement(NEW.user_id, 'comeback');
    END IF;
  END IF;

  -- Calculate single habit streak
  FOR v_offset IN 1..100 LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.habit_logs l
      WHERE l.habit_id = NEW.habit_id AND l.user_id = NEW.user_id
        AND l.day = NEW.day - v_offset AND l.count >= 1
    );
    v_streak := v_streak + 1;
  END LOOP;

  -- Milestone XP rewards
  IF v_streak + 1 IN (3, 7, 30) THEN
    PERFORM public.grant_habit_xp(
      NEW.user_id,
      CASE v_streak + 1 WHEN 3 THEN 30 WHEN 7 THEN 100 WHEN 30 THEN 300 END,
      (v_streak + 1)::text || '-day habit streak',
      'streak:' || NEW.habit_id || ':' || (v_streak + 1),
      NEW.habit_id, NEW.day
    );
  END IF;

  -- Streak achievements
  IF v_streak + 1 >= 3 THEN PERFORM public.unlock_habit_achievement(NEW.user_id, 'routine_builder'); END IF;
  IF v_streak + 1 >= 7 THEN PERFORM public.unlock_habit_achievement(NEW.user_id, 'on_fire'); END IF;
  IF v_streak + 1 >= 14 THEN PERFORM public.unlock_habit_achievement(NEW.user_id, 'unstoppable'); END IF;
  IF v_streak + 1 >= 30 THEN PERFORM public.unlock_habit_achievement(NEW.user_id, 'champion'); END IF;
  IF v_streak + 1 >= 60 THEN PERFORM public.unlock_habit_achievement(NEW.user_id, 'iron_will'); END IF;
  IF v_streak + 1 >= 100 THEN PERFORM public.unlock_habit_achievement(NEW.user_id, 'legendary_streak'); END IF;

  -- Perfect week check
  IF NOT EXISTS (
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
          AND l.day = days.day::date AND l.count >= 1)
  ) THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'perfect_week');
  END IF;

  -- General achievements evaluation
  PERFORM public.check_and_unlock_achievements(NEW.user_id);

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.award_habit_completion_xp() FROM PUBLIC, anon, authenticated;

-- Habit creation trigger: evaluate first_five
CREATE OR REPLACE FUNCTION public.award_first_habit_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_habits_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.xp_transactions
    WHERE user_id = NEW.user_id AND idempotency_key = 'first-habit:' || NEW.user_id) THEN
    PERFORM public.grant_habit_xp(NEW.user_id, 10, 'First habit created',
      'first-habit:' || NEW.user_id, NEW.id, NULL);
  END IF;

  SELECT count(*) INTO v_habits_count
  FROM public.habits
  WHERE user_id = NEW.user_id AND archived_at IS NULL;

  IF v_habits_count >= 5 THEN
    PERFORM public.unlock_habit_achievement(NEW.user_id, 'first_five');
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.award_first_habit_xp() FROM PUBLIC, anon, authenticated;

-- ===== drizzle/migrations/0009_difficulty_xp_30_hour_edit_window.sql =====

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

-- ===== drizzle/migrations/0010_allow_zero_habit_focus_goal.sql =====
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

