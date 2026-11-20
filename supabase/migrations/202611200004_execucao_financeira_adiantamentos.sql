-- Valores de recebimento/despesas e encerramento da prestação de contas.
-- Valores antigos ficam NULL para exigir conferência manual antes da finalização.

BEGIN;

ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS valor_recebido numeric(14,2),
  ADD COLUMN IF NOT EXISTS finalizado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalizado_em timestamptz;

ALTER TABLE public.adiantamentos
  DROP CONSTRAINT IF EXISTS adiantamentos_valor_recebido_check;
ALTER TABLE public.adiantamentos
  ADD CONSTRAINT adiantamentos_valor_recebido_check
  CHECK (valor_recebido IS NULL OR valor_recebido > 0);

ALTER TABLE public.adiantamentos
  DROP CONSTRAINT IF EXISTS adiantamentos_finalizado_data_check;
ALTER TABLE public.adiantamentos
  ADD CONSTRAINT adiantamentos_finalizado_data_check
  CHECK ((finalizado = false) OR finalizado_em IS NOT NULL);

ALTER TABLE public.adiantamento_notas
  ADD COLUMN IF NOT EXISTS valor_despesa numeric(14,2);

ALTER TABLE public.adiantamento_notas
  DROP CONSTRAINT IF EXISTS adiantamento_notas_valor_despesa_check;
ALTER TABLE public.adiantamento_notas
  ADD CONSTRAINT adiantamento_notas_valor_despesa_check
  CHECK (valor_despesa IS NULL OR valor_despesa > 0);

CREATE OR REPLACE FUNCTION public.impedir_alteracao_adiantamento_finalizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.finalizado THEN
    RAISE EXCEPTION 'Este adiantamento já foi finalizado e não pode mais ser alterado ou excluído.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_impedir_alteracao_adiantamento_finalizado
  ON public.adiantamentos;

CREATE TRIGGER trg_impedir_alteracao_adiantamento_finalizado
BEFORE UPDATE OR DELETE ON public.adiantamentos
FOR EACH ROW
EXECUTE FUNCTION public.impedir_alteracao_adiantamento_finalizado();

CREATE OR REPLACE FUNCTION public.impedir_alteracao_nota_adiantamento_finalizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adiantamento_id uuid;
  v_finalizado boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_adiantamento_id := OLD.adiantamento_id;
  ELSE
    v_adiantamento_id := NEW.adiantamento_id;
  END IF;

  SELECT a.finalizado
    INTO v_finalizado
  FROM public.adiantamentos a
  WHERE a.id = v_adiantamento_id
  FOR UPDATE;

  IF v_finalizado IS TRUE THEN
    RAISE EXCEPTION 'As notas deste adiantamento não podem ser alteradas após a finalização.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_impedir_alteracao_nota_adiantamento_finalizado
  ON public.adiantamento_notas;

CREATE TRIGGER trg_impedir_alteracao_nota_adiantamento_finalizado
BEFORE INSERT OR UPDATE OR DELETE ON public.adiantamento_notas
FOR EACH ROW
EXECUTE FUNCTION public.impedir_alteracao_nota_adiantamento_finalizado();

CREATE OR REPLACE FUNCTION public.finalizar_adiantamento(p_adiantamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_adiantamento public.adiantamentos%ROWTYPE;
  v_quantidade integer := 0;
  v_pendentes integer := 0;
  v_total_despesas numeric(14,2) := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_ativo(auth.uid()) THEN
    RAISE EXCEPTION 'Usuário não autenticado ou sem acesso ativo.';
  END IF;

  SELECT *
    INTO v_adiantamento
  FROM public.adiantamentos
  WHERE id = p_adiantamento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adiantamento não encontrado ou sem permissão de acesso.';
  END IF;

  IF v_adiantamento.finalizado THEN
    RAISE EXCEPTION 'Este adiantamento já foi finalizado.';
  END IF;

  IF v_adiantamento.valor_recebido IS NULL OR v_adiantamento.valor_recebido <= 0 THEN
    RAISE EXCEPTION 'Informe o valor recebido do adiantamento antes de finalizar.';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE valor_despesa IS NULL OR valor_despesa <= 0)::integer,
    coalesce(sum(valor_despesa), 0)::numeric(14,2)
  INTO v_quantidade, v_pendentes, v_total_despesas
  FROM public.adiantamento_notas
  WHERE adiantamento_id = p_adiantamento_id;

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'Existem % nota(s) sem valor de despesa. Informe os valores antes de finalizar.', v_pendentes;
  END IF;

  IF v_total_despesas > v_adiantamento.valor_recebido THEN
    RAISE EXCEPTION 'O total das despesas é maior que o valor recebido. Confira os lançamentos antes de finalizar.';
  END IF;

  UPDATE public.adiantamentos
  SET finalizado = true,
      finalizado_em = now()
  WHERE id = p_adiantamento_id
  RETURNING * INTO v_adiantamento;

  RETURN jsonb_build_object(
    'adiantamento_id', v_adiantamento.id,
    'finalizado', v_adiantamento.finalizado,
    'finalizado_em', v_adiantamento.finalizado_em,
    'valor_recebido', v_adiantamento.valor_recebido,
    'quantidade_notas', v_quantidade,
    'total_despesas', v_total_despesas,
    'valor_devolucao', v_adiantamento.valor_recebido - v_total_despesas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalizar_adiantamento(uuid)
  TO authenticated;

COMMENT ON COLUMN public.adiantamentos.valor_recebido IS
  'Valor total recebido no processo, em reais.';
COMMENT ON COLUMN public.adiantamentos.finalizado IS
  'Indica que a conferência da execução financeira foi confirmada e o processo encerrado.';
COMMENT ON COLUMN public.adiantamento_notas.valor_despesa IS
  'Valor individual da despesa comprovada pela nota fiscal, em reais.';

COMMIT;
