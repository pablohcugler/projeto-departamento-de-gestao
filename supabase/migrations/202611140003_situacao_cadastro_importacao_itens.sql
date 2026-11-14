-- Classificação cadastral de Atas e Contratos e campos de importação de itens.
-- Os registros de teste já foram removidos manualmente antes da publicação.
-- Esta migração não exclui registros para preservar cadastros futuros.
BEGIN;


ALTER TABLE public.atas
  ADD COLUMN IF NOT EXISTS situacao_cadastro text NOT NULL DEFAULT 'Em andamento';

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS situacao_cadastro text NOT NULL DEFAULT 'Em andamento';

ALTER TABLE public.ata_itens
  ADD COLUMN IF NOT EXISTS codigo_item text,
  ADD COLUMN IF NOT EXISTS codigo_produto text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atas_situacao_cadastro_check'
      AND conrelid = 'public.atas'::regclass
  ) THEN
    ALTER TABLE public.atas
      ADD CONSTRAINT atas_situacao_cadastro_check
      CHECK (situacao_cadastro IN ('Em andamento', 'Vigentes'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_situacao_cadastro_check'
      AND conrelid = 'public.contratos'::regclass
  ) THEN
    ALTER TABLE public.contratos
      ADD CONSTRAINT contratos_situacao_cadastro_check
      CHECK (situacao_cadastro IN ('Em andamento', 'Vigentes'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS atas_situacao_cadastro_idx
  ON public.atas (situacao_cadastro);
CREATE INDEX IF NOT EXISTS contratos_situacao_cadastro_idx
  ON public.contratos (situacao_cadastro);

COMMIT;
