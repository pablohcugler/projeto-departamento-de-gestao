ALTER TABLE public.atas ADD COLUMN memorando_1doc text, ADD COLUMN processo_1doc text;
ALTER TABLE public.contratos ADD COLUMN memorando_1doc text, ADD COLUMN processo_1doc text;

CREATE TABLE public.anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  ref_tipo text NOT NULL CHECK (ref_tipo IN ('ata','contrato')),
  ref_id uuid NOT NULL,
  tipo_doc text NOT NULL,
  nome text NOT NULL,
  caminho text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anexos_ref_idx ON public.anexos(ref_tipo, ref_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anexos TO authenticated;
GRANT ALL ON public.anexos TO service_role;
ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads anexos" ON public.anexos FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert anexos" ON public.anexos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner or admin deletes anexos" ON public.anexos FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "team reads anexos files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'anexos');
CREATE POLICY "team uploads anexos files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'anexos' AND owner = auth.uid());
CREATE POLICY "owner or admin deletes anexos files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'anexos' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));