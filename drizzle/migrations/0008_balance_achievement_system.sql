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
