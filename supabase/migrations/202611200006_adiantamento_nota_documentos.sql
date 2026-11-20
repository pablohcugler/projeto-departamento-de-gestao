-- Documentos complementares vinculados a cada nota de despesa.
-- Os arquivos ficam no bucket privado "anexos", dentro do caminho do adiantamento.

CREATE TABLE IF NOT EXISTS public.adiantamento_nota_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adiantamento_id uuid NOT NULL
    REFERENCES public.adiantamentos(id) ON DELETE CASCADE,
  nota_id uuid NOT NULL
    REFERENCES public.adiantamento_notas(id) ON DELETE CASCADE,
  arquivo_nome text NOT NULL CHECK (btrim(arquivo_nome) <> ''),
  arquivo_caminho text NOT NULL UNIQUE,
  arquivo_mime_type text NOT NULL,
  arquivo_tamanho_bytes bigint NOT NULL CHECK (arquivo_tamanho_bytes > 0),
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adiantamento_nota_documentos_nota_idx
  ON public.adiantamento_nota_documentos(nota_id, created_at);

ALTER TABLE public.adiantamento_nota_documentos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE
  ON TABLE public.adiantamento_nota_documentos TO authenticated;

GRANT ALL
  ON TABLE public.adiantamento_nota_documentos TO service_role;

DROP POLICY IF EXISTS "sector reads adiantamento note documents"
  ON public.adiantamento_nota_documentos;
DROP POLICY IF EXISTS "sector inserts adiantamento note documents"
  ON public.adiantamento_nota_documentos;
DROP POLICY IF EXISTS "sector deletes adiantamento note documents"
  ON public.adiantamento_nota_documentos;

CREATE POLICY "sector reads adiantamento note documents"
ON public.adiantamento_nota_documentos
FOR SELECT TO authenticated
USING (
  public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_nota_documentos.adiantamento_id
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

CREATE POLICY "sector inserts adiantamento note documents"
ON public.adiantamento_nota_documentos
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    JOIN public.adiantamento_notas n
      ON n.adiantamento_id = a.id
    WHERE a.id = adiantamento_nota_documentos.adiantamento_id
      AND n.id = adiantamento_nota_documentos.nota_id
      AND a.finalizado = false
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

CREATE POLICY "sector deletes adiantamento note documents"
ON public.adiantamento_nota_documentos
FOR DELETE TO authenticated
USING (
  public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_nota_documentos.adiantamento_id
      AND a.finalizado = false
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

CREATE OR REPLACE FUNCTION public.impedir_documento_nota_adiantamento_finalizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_finalizado boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT a.finalizado INTO v_finalizado
    FROM public.adiantamentos a
    WHERE a.id = OLD.adiantamento_id
    FOR UPDATE;
  ELSE
    SELECT a.finalizado INTO v_finalizado
    FROM public.adiantamentos a
    WHERE a.id = NEW.adiantamento_id
    FOR UPDATE;
  END IF;

  IF v_finalizado IS TRUE THEN
    RAISE EXCEPTION
      'Os documentos complementares não podem ser alterados após a finalização do adiantamento.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_impedir_documento_nota_adiantamento_finalizado
  ON public.adiantamento_nota_documentos;

CREATE TRIGGER trg_impedir_documento_nota_adiantamento_finalizado
BEFORE INSERT OR DELETE ON public.adiantamento_nota_documentos
FOR EACH ROW
EXECUTE FUNCTION public.impedir_documento_nota_adiantamento_finalizado();

COMMENT ON TABLE public.adiantamento_nota_documentos IS
  'Documentos complementares (listas de presença, certificados e comprovantes) vinculados às notas fiscais dos adiantamentos.';

COMMENT ON COLUMN public.adiantamento_nota_documentos.arquivo_caminho IS
  'Caminho no bucket privado anexos, sob adiantamento/{adiantamento_id}/...';
