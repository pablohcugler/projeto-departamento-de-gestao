-- Cadastro e acompanhamento de processos de adiantamento financeiro.
-- Acesso segregado por setor, com acesso transversal conforme usuario_pode_acessar_setor.

CREATE TABLE IF NOT EXISTS public.adiantamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_1doc text NOT NULL CHECK (btrim(processo_1doc) <> ''),
  data_recebimento date NOT NULL,
  periodo_aplicacao_dias integer NOT NULL CHECK (periodo_aplicacao_dias > 0),
  data_vencimento date NOT NULL,
  numero_empenho text NOT NULL CHECK (btrim(numero_empenho) <> ''),
  setor_id uuid NOT NULL DEFAULT public.current_user_setor_id()
    REFERENCES public.setores(id),
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adiantamentos_data_vencimento_check
    CHECK (data_vencimento = data_recebimento + periodo_aplicacao_dias)
);

CREATE INDEX IF NOT EXISTS adiantamentos_setor_vencimento_idx
  ON public.adiantamentos(setor_id, data_vencimento);

CREATE INDEX IF NOT EXISTS adiantamentos_processo_1doc_idx
  ON public.adiantamentos(processo_1doc);

ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sector reads adiantamentos" ON public.adiantamentos;
DROP POLICY IF EXISTS "sector inserts adiantamentos" ON public.adiantamentos;
DROP POLICY IF EXISTS "sector updates adiantamentos" ON public.adiantamentos;
DROP POLICY IF EXISTS "sector deletes adiantamentos" ON public.adiantamentos;

CREATE POLICY "sector reads adiantamentos" ON public.adiantamentos
FOR SELECT TO authenticated
USING (public.usuario_ativo(auth.uid()) AND public.usuario_pode_acessar_setor(setor_id));

CREATE POLICY "sector inserts adiantamentos" ON public.adiantamentos
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.usuario_ativo(auth.uid())
  AND public.usuario_pode_acessar_setor(setor_id)
);

CREATE POLICY "sector updates adiantamentos" ON public.adiantamentos
FOR UPDATE TO authenticated
USING (public.usuario_ativo(auth.uid()) AND public.usuario_pode_acessar_setor(setor_id))
WITH CHECK (public.usuario_ativo(auth.uid()) AND public.usuario_pode_acessar_setor(setor_id));

CREATE POLICY "sector deletes adiantamentos" ON public.adiantamentos
FOR DELETE TO authenticated
USING (public.usuario_ativo(auth.uid()) AND public.usuario_pode_acessar_setor(setor_id));

COMMENT ON TABLE public.adiantamentos IS
  'Cadastro dos processos de adiantamento financeiro recebidos pela Secretaria Municipal de Saúde.';
COMMENT ON COLUMN public.adiantamentos.data_vencimento IS
  'Data de recebimento acrescida do período de aplicação em dias.';
