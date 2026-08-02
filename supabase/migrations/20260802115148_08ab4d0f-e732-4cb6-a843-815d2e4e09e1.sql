CREATE TABLE public.journal_state (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_state TO authenticated;
GRANT ALL ON public.journal_state TO service_role;
ALTER TABLE public.journal_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own journal state" ON public.journal_state FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_state;