ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Health';
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT 'sparkles';
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS habit_id uuid REFERENCES public.habits(id) ON DELETE SET NULL;
COMMENT ON TABLE public.user_settings IS 'DEPRECATED: daily work target removed';