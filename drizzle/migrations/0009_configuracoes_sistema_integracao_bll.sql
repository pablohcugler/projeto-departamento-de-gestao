-- Configuração administrativa da integração com a BLL.
-- Leitura disponível a usuários autenticados ativos; alterações somente pelo backend administrativo.

CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES ('integracao_bll', '{"ativa": true}'::jsonb)
ON CONFLICT (chave) DO NOTHING;

ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.configuracoes_sistema TO authenticated;
GRANT ALL ON public.configuracoes_sistema TO service_role;

DROP POLICY IF EXISTS "active users read system settings" ON public.configuracoes_sistema;
CREATE POLICY "active users read system settings"
ON public.configuracoes_sistema
FOR SELECT TO authenticated
USING (public.usuario_ativo(auth.uid()));

COMMENT ON TABLE public.configuracoes_sistema IS
  'Configurações globais do sistema, alteradas exclusivamente pelo backend administrativo.';
COMMENT ON COLUMN public.configuracoes_sistema.chave IS
  'Identificador único da configuração.';
COMMENT ON COLUMN public.configuracoes_sistema.valor IS
  'Valor JSON da configuração.';
