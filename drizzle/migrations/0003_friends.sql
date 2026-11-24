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
