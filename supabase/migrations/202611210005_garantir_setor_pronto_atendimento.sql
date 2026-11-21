-- Garante a existência do setor Pronto Atendimento na lista de lotações.
-- Idempotente: pode ser executada mais de uma vez sem criar setores duplicados.
-- Executar após as migrações 202611210002 e 202611210004.

BEGIN;

DO $$
DECLARE
  v_gestao_id uuid;
  v_pronto_atendimento_id uuid;
BEGIN
  SELECT id INTO v_gestao_id
  FROM public.setores
  WHERE lower(trim(nome)) = lower('Gestão')
  ORDER BY created_at
  LIMIT 1;

  IF v_gestao_id IS NULL THEN
    RAISE EXCEPTION 'O setor Gestão não foi encontrado. Execute primeiro a migração 202611210002_setor_pronto_atendimento.sql e confira a migração de Gestão.';
  END IF;

  INSERT INTO public.setores (nome, ativo, acesso_global, parent_id)
  VALUES ('Pronto Atendimento', true, false, v_gestao_id)
  ON CONFLICT (nome) DO UPDATE
    SET ativo = true,
        acesso_global = false,
        parent_id = EXCLUDED.parent_id
  RETURNING id INTO v_pronto_atendimento_id;

  -- Se a matriz de permissões já estiver instalada, cria as permissões padrão
  -- sem sobrescrever escolhas que o administrador já tenha feito.
  IF to_regclass('public.setor_permissoes_modulos') IS NOT NULL THEN
    INSERT INTO public.setor_permissoes_modulos (setor_id, modulo, permitido)
    VALUES
      (v_pronto_atendimento_id, 'pca', false),
      (v_pronto_atendimento_id, 'atas', false),
      (v_pronto_atendimento_id, 'contratos', false),
      (v_pronto_atendimento_id, 'oficios', false),
      (v_pronto_atendimento_id, 'adiantamentos', true)
    ON CONFLICT (setor_id, modulo) DO NOTHING;
  END IF;
END
$$;

COMMIT;
