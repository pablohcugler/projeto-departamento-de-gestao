-- Permite cadastrar Atas ainda em andamento antes da emissão do número definitivo.
-- Atas vigentes continuam exigindo o número no formulário da aplicação.
ALTER TABLE public.atas
  ALTER COLUMN numero DROP NOT NULL;


-- Número utilizado para localizar a fase na consulta pública da BLL Compras.
ALTER TABLE public.atas
  ADD COLUMN IF NOT EXISTS numero_edital_bll text;
