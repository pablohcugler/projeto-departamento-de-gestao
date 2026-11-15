-- Guarda o último saldo conferido para cada item, sem sobrescrever a quantidade original registrada na ata.
ALTER TABLE public.ata_itens
  ADD COLUMN IF NOT EXISTS saldo_disponivel numeric(14,3),
  ADD COLUMN IF NOT EXISTS saldo_atualizado_em date;

-- Atualiza apenas os campos de saldo, inclusive para membros da equipe que não são
-- proprietários originais do cadastro da ata. A função não altera preço/quantidade contratada.
CREATE OR REPLACE FUNCTION public.atualizar_saldos_ata(
  p_ata_id uuid,
  p_data_relatorio date,
  p_saldos jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atualizados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_team_member(auth.uid()) THEN
    RAISE EXCEPTION 'Usuário sem permissão para atualizar saldo da ata.';
  END IF;

  IF p_data_relatorio IS NULL
     OR p_data_relatorio <> (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'O relatório precisa ter a data de hoje.';
  END IF;

  IF jsonb_typeof(p_saldos) <> 'array' THEN
    RAISE EXCEPTION 'Lista de saldos inválida.';
  END IF;

  UPDATE public.ata_itens AS ai
  SET
    saldo_disponivel = s.saldo,
    saldo_atualizado_em = p_data_relatorio
  FROM jsonb_to_recordset(p_saldos) AS s(item_id uuid, saldo numeric)
  WHERE ai.id = s.item_id
    AND ai.ata_id = p_ata_id
    AND s.saldo >= 0;

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RETURN v_atualizados;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_saldos_ata(uuid, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_saldos_ata(uuid, date, jsonb) TO authenticated;
