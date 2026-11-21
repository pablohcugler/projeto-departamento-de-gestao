-- Adiciona Pronto Atendimento como setor de lotação do sistema.
-- Fica subordinado a Gestão para manter a hierarquia existente, sem acesso global.
DO $$
DECLARE
  v_gestao_id uuid;
BEGIN
  SELECT id
    INTO v_gestao_id
  FROM public.setores
  WHERE nome = 'Gestão'
  LIMIT 1;

  IF v_gestao_id IS NULL THEN
    RAISE EXCEPTION 'O setor Gestão não foi encontrado. Execute antes a migração de hierarquia dos setores.';
  END IF;

  INSERT INTO public.setores (nome, ativo, acesso_global, parent_id)
  VALUES ('Pronto Atendimento', true, false, v_gestao_id)
  ON CONFLICT (nome) DO UPDATE
    SET ativo = true,
        acesso_global = false,
        parent_id = EXCLUDED.parent_id;
END
$$;

COMMENT ON TABLE public.setores IS
  'Setores/lotação dos usuários do sistema, incluindo Pronto Atendimento.';
