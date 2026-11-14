CREATE TABLE public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  numero text NOT NULL,
  objeto text NOT NULL,
  contratado text,
  valor numeric(16,2),
  data_inicio date,
  data_vencimento date NOT NULL,
  dias_alerta integer NOT NULL DEFAULT 90,
  classificacao_id uuid REFERENCES public.classificacoes(id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos TO authenticated;
GRANT ALL ON public.contratos TO service_role;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contratos" ON public.contratos FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());