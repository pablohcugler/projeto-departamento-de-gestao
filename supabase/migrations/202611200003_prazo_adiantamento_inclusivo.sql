-- Considera o dia do recebimento como o primeiro dia do período.
-- Atualiza também os processos já cadastrados para a regra inclusiva.

BEGIN;

ALTER TABLE public.adiantamentos
  DROP CONSTRAINT IF EXISTS adiantamentos_data_vencimento_check;

UPDATE public.adiantamentos
SET data_vencimento = data_recebimento + (periodo_aplicacao_dias - 1)
WHERE data_vencimento IS DISTINCT FROM
      data_recebimento + (periodo_aplicacao_dias - 1);

ALTER TABLE public.adiantamentos
  ADD CONSTRAINT adiantamentos_data_vencimento_check
  CHECK (
    data_vencimento =
    data_recebimento + (periodo_aplicacao_dias - 1)
  );

COMMENT ON COLUMN public.adiantamentos.data_vencimento IS
  'Prazo final inclusivo: o dia do recebimento corresponde ao primeiro dia do período de aplicação.';

COMMIT;
