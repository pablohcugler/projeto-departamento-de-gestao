-- Permite cadastrar Atas ainda em andamento antes da emissão do número definitivo.
-- Atas vigentes continuam exigindo o número no formulário da aplicação.
ALTER TABLE public.atas
  ALTER COLUMN numero DROP NOT NULL;
