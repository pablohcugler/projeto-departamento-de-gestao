-- Separa o título/descrição sucinta da justificativa da despesa.
-- Registros antigos recebem texto vazio e podem continuar sendo consultados.
ALTER TABLE public.adiantamento_notas
  ADD COLUMN IF NOT EXISTS justificativa text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.adiantamento_notas.justificativa IS
  'Justificativa detalhada da despesa, exibida no relatório individual da nota fiscal.';
