-- Notas de despesas vinculadas aos processos de adiantamento.
-- O arquivo físico fica no bucket privado "anexos", em:
-- adiantamento/{adiantamento_id}/{nota_id}/{arquivo}
-- A autorização do arquivo é herdada do setor do processo pai.

CREATE TABLE IF NOT EXISTS public.adiantamento_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adiantamento_id uuid NOT NULL
    REFERENCES public.adiantamentos(id) ON DELETE CASCADE,
  numero_nota text NOT NULL CHECK (btrim(numero_nota) <> ''),
  data_nota date NOT NULL,
  fornecedor text NOT NULL CHECK (btrim(fornecedor) <> ''),
  descricao text NOT NULL CHECK (btrim(descricao) <> ''),
  arquivo_nome text,
  arquivo_caminho text,
  arquivo_mime_type text,
  arquivo_tamanho_bytes bigint CHECK (arquivo_tamanho_bytes IS NULL OR arquivo_tamanho_bytes > 0),
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adiantamento_notas_arquivo_metadata_check CHECK (
    (arquivo_caminho IS NULL AND arquivo_nome IS NULL AND arquivo_mime_type IS NULL AND arquivo_tamanho_bytes IS NULL)
    OR
    (arquivo_caminho IS NOT NULL AND arquivo_nome IS NOT NULL AND arquivo_mime_type IS NOT NULL AND arquivo_tamanho_bytes IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS adiantamento_notas_adiantamento_data_idx
  ON public.adiantamento_notas(adiantamento_id, data_nota DESC);

ALTER TABLE public.adiantamento_notas ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.adiantamento_notas TO authenticated;

GRANT ALL
  ON TABLE public.adiantamento_notas TO service_role;

DROP POLICY IF EXISTS "sector reads adiantamento notes" ON public.adiantamento_notas;
DROP POLICY IF EXISTS "sector inserts adiantamento notes" ON public.adiantamento_notas;
DROP POLICY IF EXISTS "sector updates adiantamento notes" ON public.adiantamento_notas;
DROP POLICY IF EXISTS "sector deletes adiantamento notes" ON public.adiantamento_notas;

CREATE POLICY "sector reads adiantamento notes"
ON public.adiantamento_notas
FOR SELECT TO authenticated
USING (
  public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_notas.adiantamento_id
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

CREATE POLICY "sector inserts adiantamento notes"
ON public.adiantamento_notas
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_notas.adiantamento_id
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

CREATE POLICY "sector updates adiantamento notes"
ON public.adiantamento_notas
FOR UPDATE TO authenticated
USING (
  public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_notas.adiantamento_id
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
)
WITH CHECK (
  public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_notas.adiantamento_id
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

CREATE POLICY "sector deletes adiantamento notes"
ON public.adiantamento_notas
FOR DELETE TO authenticated
USING (
  public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_notas.adiantamento_id
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

-- Permite que as funções de autorização existentes reconheçam arquivos
-- vinculados a processos de adiantamento.
CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_referencia(
  p_ref_tipo text,
  p_ref_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_id uuid;
BEGIN
  IF p_ref_tipo = 'ata' THEN
    SELECT a.setor_id INTO v_setor_id
    FROM public.atas a
    WHERE a.id = p_ref_id;
  ELSIF p_ref_tipo = 'contrato' THEN
    SELECT c.setor_id INTO v_setor_id
    FROM public.contratos c
    WHERE c.id = p_ref_id;
  ELSIF p_ref_tipo = 'adiantamento' THEN
    SELECT a.setor_id INTO v_setor_id
    FROM public.adiantamentos a
    WHERE a.id = p_ref_id;
  ELSE
    RETURN false;
  END IF;

  RETURN v_setor_id IS NOT NULL
    AND public.usuario_pode_acessar_setor(v_setor_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_referencia(text, uuid)
  TO authenticated;

COMMENT ON TABLE public.adiantamento_notas IS
  'Notas fiscais e documentos de despesas vinculados aos processos de adiantamento.';
COMMENT ON COLUMN public.adiantamento_notas.arquivo_caminho IS
  'Caminho do documento no bucket privado anexos; a autorização é herdada do setor do adiantamento.';
