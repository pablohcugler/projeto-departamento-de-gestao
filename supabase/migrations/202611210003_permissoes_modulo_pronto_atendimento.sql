-- Permissões por módulo para o setor Pronto Atendimento.
-- O setor pode utilizar Adiantamentos; os demais módulos continuam visíveis no painel,
-- mas o acesso aos dados é negado na camada de banco de dados.
-- Administradores mantêm o acesso global previsto pela política do sistema.

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
    JOIN public.setores s ON s.id = p.setor_id
    WHERE p.user_id = auth.uid()
      AND p.suspenso = false
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR lower(trim(s.nome)) <> 'pronto atendimento'
        OR lower(trim(coalesce(p_modulo, ''))) = 'adiantamentos'
      )
  )
$$;

REVOKE ALL ON FUNCTION public.usuario_pode_acessar_modulo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_modulo(text) TO authenticated;

COMMENT ON FUNCTION public.usuario_pode_acessar_modulo(text) IS
  'Autoriza o setor Pronto Atendimento somente no módulo Adiantamentos. Administradores mantêm acesso global.';

-- Atualiza a autorização de referências e anexos para respeitar o módulo de origem.
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
  IF p_ref_tipo = 'ata' THEN
    v_modulo := 'atas';
    SELECT a.setor_id INTO v_setor_id
    FROM public.atas a
    WHERE a.id = p_ref_id;
  ELSIF p_ref_tipo = 'contrato' THEN
    v_modulo := 'contratos';
    SELECT c.setor_id INTO v_setor_id
    FROM public.contratos c
    WHERE c.id = p_ref_id;
  ELSIF p_ref_tipo = 'adiantamento' THEN
    v_modulo := 'adiantamentos';
    SELECT a.setor_id INTO v_setor_id
    FROM public.adiantamentos a
    WHERE a.id = p_ref_id;
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

-- Atas, itens, contratos, classificações e pedidos ficam bloqueados para Pronto Atendimento.
-- Políticas RESTRICTIVE são combinadas por AND com as políticas setoriais já existentes.
DROP POLICY IF EXISTS "module permission atas" ON public.atas;
CREATE POLICY "module permission atas"
ON public.atas AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_modulo('atas'))
WITH CHECK (public.usuario_pode_acessar_modulo('atas'));

DROP POLICY IF EXISTS "module permission ata items" ON public.ata_itens;
CREATE POLICY "module permission ata items"
ON public.ata_itens AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_modulo('atas'))
WITH CHECK (public.usuario_pode_acessar_modulo('atas'));

DROP POLICY IF EXISTS "module permission contratos" ON public.contratos;
CREATE POLICY "module permission contratos"
ON public.contratos AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_modulo('contratos'))
WITH CHECK (public.usuario_pode_acessar_modulo('contratos'));

DROP POLICY IF EXISTS "module permission classificacoes" ON public.classificacoes;
CREATE POLICY "module permission classificacoes"
ON public.classificacoes AS RESTRICTIVE
FOR ALL TO authenticated
USING (
  public.usuario_pode_acessar_modulo('atas')
  OR public.usuario_pode_acessar_modulo('contratos')
)
WITH CHECK (
  public.usuario_pode_acessar_modulo('atas')
  OR public.usuario_pode_acessar_modulo('contratos')
);

DROP POLICY IF EXISTS "module permission pedidos" ON public.pedidos;
CREATE POLICY "module permission pedidos"
ON public.pedidos AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_modulo('atas'))
WITH CHECK (public.usuario_pode_acessar_modulo('atas'));

-- Restringe metadados e arquivos anexos conforme o módulo de origem.
DROP POLICY IF EXISTS "module permission anexos metadata" ON public.anexos;
CREATE POLICY "module permission anexos metadata"
ON public.anexos AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_referencia(ref_tipo, ref_id))
WITH CHECK (public.usuario_pode_acessar_referencia(ref_tipo, ref_id));

DROP POLICY IF EXISTS "module permission anexos storage" ON storage.objects;
CREATE POLICY "module permission anexos storage"
ON storage.objects AS RESTRICTIVE
FOR ALL TO authenticated
USING (
  bucket_id <> 'anexos'
  OR public.usuario_pode_acessar_arquivo_anexo(name)
)
WITH CHECK (
  bucket_id <> 'anexos'
  OR public.usuario_pode_acessar_arquivo_anexo(name)
);

-- O módulo Adiantamentos permanece liberado para Pronto Atendimento,
-- sempre respeitando o setor do processo e a situação ativa do usuário.
DROP POLICY IF EXISTS "module permission adiantamentos" ON public.adiantamentos;
CREATE POLICY "module permission adiantamentos"
ON public.adiantamentos AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_modulo('adiantamentos'))
WITH CHECK (public.usuario_pode_acessar_modulo('adiantamentos'));

DROP POLICY IF EXISTS "module permission adiantamento notas" ON public.adiantamento_notas;
CREATE POLICY "module permission adiantamento notas"
ON public.adiantamento_notas AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_modulo('adiantamentos'))
WITH CHECK (public.usuario_pode_acessar_modulo('adiantamentos'));

DROP POLICY IF EXISTS "module permission adiantamento nota documentos" ON public.adiantamento_nota_documentos;
CREATE POLICY "module permission adiantamento nota documentos"
ON public.adiantamento_nota_documentos AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_modulo('adiantamentos'))
WITH CHECK (public.usuario_pode_acessar_modulo('adiantamentos'));

DROP POLICY IF EXISTS "module permission adiantamento prestacao arquivos" ON public.adiantamento_prestacao_arquivos;
CREATE POLICY "module permission adiantamento prestacao arquivos"
ON public.adiantamento_prestacao_arquivos AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.usuario_pode_acessar_modulo('adiantamentos'))
WITH CHECK (public.usuario_pode_acessar_modulo('adiantamentos'));
