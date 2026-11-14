CREATE TABLE public.classificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classificacoes TO authenticated;
GRANT ALL ON public.classificacoes TO service_role;
ALTER TABLE public.classificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own classificacoes" ON public.classificacoes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
ALTER TABLE public.atas ADD COLUMN classificacao_id uuid REFERENCES public.classificacoes(id) ON DELETE SET NULL;