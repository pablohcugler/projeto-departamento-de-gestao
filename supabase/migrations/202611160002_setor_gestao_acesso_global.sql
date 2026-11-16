-- Cria Gestão como setor pai com acesso transversal aos dados dos setores filhos.
-- Preserva as lotações e os registros existentes.

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.setores(id) ON DELETE SET NULL;

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS acesso_global boolean NOT NULL DEFAULT false;

INSERT INTO public.setores (nome, ativo, acesso_global)
VALUES ('Gestão', true, true)
ON CONFLICT (nome) DO UPDATE
SET ativo = true,
    acesso_global = true;

-- Define Gestão como pai de Aquisições, Farmácia e Almoxarifado.
UPDATE public.setores AS filho
SET parent_id = pai.id,
    acesso_global = false
FROM public.setores AS pai
WHERE pai.nome = 'Gestão'
  AND filho.nome IN ('Aquisições', 'Farmácia', 'Almoxarifado');

-- Garantir que o setor pai não tenha outro setor pai.
UPDATE public.setores
SET parent_id = NULL, acesso_global = true
WHERE nome = 'Gestão';

CREATE INDEX IF NOT EXISTS setores_parent_id_idx
  ON public.setores(parent_id);

-- O usuário lotado em Gestão pode acessar dados de todos os setores.
-- Usuários dos setores filhos continuam limitados ao próprio setor.
-- Um pai também pode consultar seus descendentes diretos.
CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_setor(p_setor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      JOIN public.setores setor_usuario ON setor_usuario.id = p.setor_id
      WHERE p.user_id = auth.uid()
        AND p.suspenso = false
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR setor_usuario.acesso_global = true
          OR p.setor_id = p_setor_id
          OR EXISTS (
            SELECT 1
            FROM public.setores setor_filho
            WHERE setor_filho.id = p_setor_id
              AND setor_filho.parent_id = p.setor_id
          )
        )
    )
$$;

GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_setor(uuid) TO authenticated;

COMMENT ON COLUMN public.setores.parent_id IS
  'Setor hierarquicamente superior; Gestão é o setor pai de Aquisições, Farmácia e Almoxarifado.';

COMMENT ON COLUMN public.setores.acesso_global IS
  'Quando verdadeiro, usuários lotados no setor podem consultar dados de todos os setores. Não concede papel de administrador.';
