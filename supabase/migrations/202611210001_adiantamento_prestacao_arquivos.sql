-- Arquivos finais da prestação de contas de adiantamentos.
-- Os metadados ficam vinculados ao processo; os PDFs/ZIPs ficam no bucket privado anexos.

CREATE TABLE IF NOT EXISTS public.adiantamento_prestacao_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adiantamento_id uuid NOT NULL REFERENCES public.adiantamentos(id) ON DELETE CASCADE,
  nota_id uuid NULL REFERENCES public.adiantamento_notas(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN (
    'comprovante_devolucao',
    'deposito_saldo',
    'anexo_ii',
    'relatorio_nota',
    'pacote_zip'
  )),
  arquivo_nome text NOT NULL CHECK (btrim(arquivo_nome) <> ''),
  arquivo_caminho text NOT NULL UNIQUE,
  arquivo_mime_type text NOT NULL DEFAULT 'application/pdf',
  arquivo_tamanho_bytes bigint NOT NULL CHECK (arquivo_tamanho_bytes > 0),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adiantamento_prestacao_arquivos_processo_idx
  ON public.adiantamento_prestacao_arquivos(adiantamento_id, created_at);

ALTER TABLE public.adiantamento_prestacao_arquivos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE public.adiantamento_prestacao_arquivos TO authenticated;
GRANT ALL ON TABLE public.adiantamento_prestacao_arquivos TO service_role;

DROP POLICY IF EXISTS "sector reads adiantamento prestacao files"
  ON public.adiantamento_prestacao_arquivos;
DROP POLICY IF EXISTS "sector inserts adiantamento prestacao files"
  ON public.adiantamento_prestacao_arquivos;

CREATE POLICY "sector reads adiantamento prestacao files"
ON public.adiantamento_prestacao_arquivos
FOR SELECT TO authenticated
USING (
  public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_prestacao_arquivos.adiantamento_id
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

-- O comprovante e os documentos finais só podem ser registrados depois da confirmação.
CREATE POLICY "sector inserts adiantamento prestacao files"
ON public.adiantamento_prestacao_arquivos
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_prestacao_arquivos.adiantamento_id
      AND a.finalizado = true
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

COMMENT ON TABLE public.adiantamento_prestacao_arquivos IS
  'Comprovantes de devolução e arquivos PDF/ZIP gerados para a prestação de contas finalizada.';
