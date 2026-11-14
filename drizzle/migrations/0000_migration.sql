CREATE TABLE public.atas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  numero text NOT NULL,
  processo text,
  objeto text NOT NULL,
  fornecedor text,
  data_homologacao date,
  data_vencimento date NOT NULL,
  dias_alerta integer NOT NULL DEFAULT 90,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atas TO authenticated;
GRANT ALL ON public.atas TO service_role;
ALTER TABLE public.atas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own atas" ON public.atas FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.ata_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id uuid NOT NULL REFERENCES public.atas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  descricao text NOT NULL,
  unidade text NOT NULL DEFAULT 'UN',
  quantidade numeric(14,3) NOT NULL DEFAULT 1,
  preco_unitario numeric(14,2) NOT NULL DEFAULT 0,
  preco_total numeric(16,2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ata_itens TO authenticated;
GRANT ALL ON public.ata_itens TO service_role;
ALTER TABLE public.ata_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own itens" ON public.ata_itens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX ON public.ata_itens(ata_id);