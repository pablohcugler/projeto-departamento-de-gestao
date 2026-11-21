-- Permissões configuráveis por setor e isolamento estrito dos processos de adiantamento.
-- Cada setor passa a ter permissões explícitas para os módulos operacionais.
-- Usuários não administradores só consultam/alteram adiantamentos da própria lotação.

BEGIN;

CREATE TABLE IF NOT EXISTS public.setor_permissoes_modulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  modulo text NOT NULL CHECK (modulo IN ('pca', 'atas', 'contratos', 'oficios', 'adiantamentos')),
  permitido boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id),
  CONSTRAINT setor_permissoes_modulos_setor_modulo_unique UNIQUE (setor_id, modulo)
);

CREATE INDEX IF NOT EXISTS setor_permissoes_modulos_setor_idx
  ON public.setor_permissoes_modulos(setor_id);

ALTER TABLE public.setor_permissoes_modulos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.setor_permissoes_modulos TO authenticated;
GRANT ALL ON public.setor_permissoes_modulos TO service_role;

DROP POLICY IF EXISTS "users read own sector module permissions" ON public.setor_permissoes_modulos;
CREATE POLICY "users read own sector module permissions"
ON public.setor_permissoes_modulos
FOR SELECT TO authenticated
USING (
  public.usuario_ativo(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR setor_id = public.current_user_setor_id()
  )
);

DROP POLICY IF EXISTS "admins manage sector module permissions" ON public.setor_permissoes_modulos;
CREATE POLICY "admins manage sector module permissions"
ON public.setor_permissoes_modulos
FOR ALL TO authenticated
USING (
  public.usuario_ativo(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  public.usuario_ativo(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Semeia permissões para os setores existentes. Mantém os setores atuais habilitados
-- para os módulos já utilizados, exceto Pronto Atendimento, que começa apenas com Adiantamentos.
WITH modulos(modulo) AS (
  VALUES ('pca'), ('atas'), ('contratos'), ('oficios'), ('adiantamentos')
)
INSERT INTO public.setor_permissoes_modulos (setor_id, modulo, permitido)
SELECT
  s.id,
  m.modulo,
  CASE
    WHEN lower(trim(s.nome)) = 'pronto atendimento' THEN m.modulo = 'adiantamentos'
    ELSE true
  END
FROM public.setores s
CROSS JOIN modulos m
WHERE s.ativo = true
ON CONFLICT (setor_id, modulo) DO NOTHING;

-- Todo novo setor recebe permissões padrão; Pronto Atendimento permanece limitado
-- a Adiantamentos até que o administrador altere a matriz.
CREATE OR REPLACE FUNCTION public.criar_permissoes_padrao_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.setor_permissoes_modulos (setor_id, modulo, permitido)
  VALUES
    (NEW.id, 'pca', lower(trim(NEW.nome)) <> 'pronto atendimento'),
    (NEW.id, 'atas', lower(trim(NEW.nome)) <> 'pronto atendimento'),
    (NEW.id, 'contratos', lower(trim(NEW.nome)) <> 'pronto atendimento'),
    (NEW.id, 'oficios', lower(trim(NEW.nome)) <> 'pronto atendimento'),
    (NEW.id, 'adiantamentos', true)
  ON CONFLICT (setor_id, modulo) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criar_permissoes_padrao_setor ON public.setores;
CREATE TRIGGER trg_criar_permissoes_padrao_setor
AFTER INSERT ON public.setores
FOR EACH ROW
EXECUTE FUNCTION public.criar_permissoes_padrao_setor();

-- A permissão de módulo é consultada dinamicamente, sem exceção fixa pelo nome do setor.
CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_modulo(p_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.user_id = auth.uid()
      AND p.suspenso = false
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR EXISTS (
          SELECT 1
          FROM public.setor_permissoes_modulos pm
          WHERE pm.setor_id = p.setor_id
            AND pm.modulo = CASE
              WHEN lower(trim(coalesce(p_modulo, ''))) = 'pedidos' THEN 'atas'
              ELSE lower(trim(coalesce(p_modulo, '')))
            END
            AND pm.permitido = true
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.usuario_pode_acessar_modulo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_modulo(text) TO authenticated;

COMMENT ON FUNCTION public.usuario_pode_acessar_modulo(text) IS
  'Consulta a matriz de permissões por setor; administradores têm acesso global. Pedidos herda a permissão do módulo Atas.';

-- Adiantamentos: acesso estrito à lotação do usuário (ou global para administradores).
CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_adiantamento(p_adiantamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.adiantamentos a
    JOIN public.user_profiles p ON p.user_id = auth.uid()
    WHERE a.id = p_adiantamento_id
      AND p.suspenso = false
      AND public.usuario_pode_acessar_modulo('adiantamentos')
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR p.setor_id = a.setor_id
      )
  )
$$;

REVOKE ALL ON FUNCTION public.usuario_pode_acessar_adiantamento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_adiantamento(uuid) TO authenticated;

-- Restringe leitura/alteração do próprio processo ao setor exato, sem a herança global
-- que Gestão utiliza nos módulos de Atas e Contratos.
DROP POLICY IF EXISTS "strict sector adiantamentos" ON public.adiantamentos;
CREATE POLICY "strict sector adiantamentos"
ON public.adiantamentos AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_adiantamento(id))
WITH CHECK (
  public.usuario_pode_acessar_modulo('adiantamentos')
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR setor_id = public.current_user_setor_id()
  )
);

DROP POLICY IF EXISTS "strict sector adiantamento notes" ON public.adiantamento_notas;
CREATE POLICY "strict sector adiantamento notes"
ON public.adiantamento_notas AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_adiantamento(adiantamento_id))
WITH CHECK (
  public.usuario_pode_acessar_adiantamento(adiantamento_id)
  AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "strict sector adiantamento note documents" ON public.adiantamento_nota_documentos;
CREATE POLICY "strict sector adiantamento note documents"
ON public.adiantamento_nota_documentos AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_adiantamento(adiantamento_id))
WITH CHECK (
  public.usuario_pode_acessar_adiantamento(adiantamento_id)
  AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "strict sector adiantamento prestacao files" ON public.adiantamento_prestacao_arquivos;
CREATE POLICY "strict sector adiantamento prestacao files"
ON public.adiantamento_prestacao_arquivos AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_adiantamento(adiantamento_id))
WITH CHECK (
  public.usuario_pode_acessar_adiantamento(adiantamento_id)
  AND user_id = auth.uid()
);

-- Para anexos do tipo adiantamento, a autorização também respeita a lotação exata.
CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_referencia(
  p_ref_tipo text,
  p_ref_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_id uuid;
  v_modulo text;
BEGIN
  IF p_ref_tipo = 'adiantamento' THEN
    RETURN public.usuario_pode_acessar_adiantamento(p_ref_id);
  ELSIF p_ref_tipo = 'ata' THEN
    v_modulo := 'atas';
    SELECT a.setor_id INTO v_setor_id
    FROM public.atas a
    WHERE a.id = p_ref_id;
  ELSIF p_ref_tipo = 'contrato' THEN
    v_modulo := 'contratos';
    SELECT c.setor_id INTO v_setor_id
    FROM public.contratos c
    WHERE c.id = p_ref_id;
  ELSE
    RETURN false;
  END IF;

  RETURN v_setor_id IS NOT NULL
    AND public.usuario_pode_acessar_modulo(v_modulo)
    AND public.usuario_pode_acessar_setor(v_setor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.usuario_pode_acessar_referencia(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_referencia(text, uuid) TO authenticated;

COMMIT;
