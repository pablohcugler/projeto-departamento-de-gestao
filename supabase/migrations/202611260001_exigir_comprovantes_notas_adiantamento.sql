-- Exige o comprovante fiscal de cada nota antes do encerramento do adiantamento.
-- A validação ocorre no banco, inclusive para chamadas diretas à RPC.

BEGIN;

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
  v_sem_comprovante integer := 0;
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
    count(*) FILTER (WHERE arquivo_caminho IS NULL OR btrim(arquivo_caminho) = '')::integer,
    coalesce(sum(valor_despesa), 0)::numeric(14,2)
  INTO v_quantidade, v_pendentes, v_sem_comprovante, v_total_despesas
  FROM public.adiantamento_notas
  WHERE adiantamento_id = p_adiantamento_id;

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'Existem % nota(s) sem valor de despesa. Informe os valores antes de finalizar.', v_pendentes;
  END IF;

  IF v_sem_comprovante > 0 THEN
    RAISE EXCEPTION 'Existem % nota(s) sem arquivo da nota fiscal ou cupom. Anexe todos os comprovantes antes de finalizar.', v_sem_comprovante;
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

COMMENT ON FUNCTION public.finalizar_adiantamento(uuid) IS
  'Finaliza o adiantamento somente após informar valores e anexar comprovante fiscal para todas as notas.';

COMMIT;
