-- Reabertura controlada de adiantamentos finalizados.
-- Preserva o registro da finalização anterior e registra quem reabriu e quando.

BEGIN;

CREATE TABLE IF NOT EXISTS public.adiantamento_reaberturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adiantamento_id uuid NOT NULL
    REFERENCES public.adiantamentos(id) ON DELETE CASCADE,
  finalizado_em_anterior timestamptz NOT NULL,
  reaberto_em timestamptz NOT NULL DEFAULT now(),
  reaberto_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adiantamento_reaberturas_processo_idx
  ON public.adiantamento_reaberturas(adiantamento_id, reaberto_em DESC);

ALTER TABLE public.adiantamento_reaberturas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.adiantamento_reaberturas TO authenticated;
GRANT ALL ON public.adiantamento_reaberturas TO service_role;

DROP POLICY IF EXISTS "sector reads adiantamento reopen history"
  ON public.adiantamento_reaberturas;

CREATE POLICY "sector reads adiantamento reopen history"
ON public.adiantamento_reaberturas
FOR SELECT TO authenticated
USING (
  public.usuario_ativo(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    WHERE a.id = adiantamento_reaberturas.adiantamento_id
      AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);

-- A trigger só permite retirar a finalização quando a operação
-- vier da função controlada reabrir_adiantamento.
CREATE OR REPLACE FUNCTION public.impedir_alteracao_adiantamento_finalizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.finalizado THEN
    IF TG_OP = 'UPDATE'
       AND NEW.finalizado = false
       AND NEW.finalizado_em IS NULL
       AND current_setting('app.reabrir_adiantamento', true) = '1' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'Este adiantamento já foi finalizado. Use a opção Abrir para ajustes para reabrir o processo.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Registra a reabertura e libera novamente a edição do processo.
CREATE OR REPLACE FUNCTION public.reabrir_adiantamento(
  p_adiantamento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adiantamento public.adiantamentos%ROWTYPE;
  v_reaberto_em timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_ativo(auth.uid()) THEN
    RAISE EXCEPTION 'Usuário não autenticado ou sem acesso ativo.';
  END IF;

  SELECT *
    INTO v_adiantamento
  FROM public.adiantamentos
  WHERE id = p_adiantamento_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT public.usuario_pode_acessar_setor(v_adiantamento.setor_id) THEN
    RAISE EXCEPTION 'Adiantamento não encontrado ou sem permissão de acesso.';
  END IF;

  IF v_adiantamento.finalizado IS NOT TRUE THEN
    RAISE EXCEPTION 'Este adiantamento não está finalizado.';
  END IF;

  IF v_adiantamento.finalizado_em IS NULL THEN
    RAISE EXCEPTION 'Não foi localizada a data da finalização anterior. Solicite suporte antes de reabrir.';
  END IF;

  INSERT INTO public.adiantamento_reaberturas (
    adiantamento_id,
    finalizado_em_anterior,
    reaberto_em,
    reaberto_por
  )
  VALUES (
    v_adiantamento.id,
    v_adiantamento.finalizado_em,
    v_reaberto_em,
    auth.uid()
  );

  PERFORM set_config('app.reabrir_adiantamento', '1', true);

  UPDATE public.adiantamentos
  SET finalizado = false,
      finalizado_em = NULL
  WHERE id = p_adiantamento_id;

  PERFORM set_config('app.reabrir_adiantamento', '', true);

  RETURN jsonb_build_object(
    'adiantamento_id', p_adiantamento_id,
    'finalizado', false,
    'reaberto_em', v_reaberto_em,
    'finalizacao_anterior', v_adiantamento.finalizado_em
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.reabrir_adiantamento', '', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.reabrir_adiantamento(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reabrir_adiantamento(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reabrir_adiantamento(uuid) TO authenticated;

COMMENT ON TABLE public.adiantamento_reaberturas IS
  'Histórico de reaberturas de prestações de contas de adiantamentos já finalizados.';
COMMENT ON FUNCTION public.reabrir_adiantamento(uuid) IS
  'Reabre um adiantamento finalizado, preserva os lançamentos e registra usuário e data da reabertura.';

COMMIT;
