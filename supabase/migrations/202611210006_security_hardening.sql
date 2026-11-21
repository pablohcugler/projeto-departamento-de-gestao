-- Hardening de autenticação, funções auxiliares e armazenamento privado.
-- Aplicar após as migrações de permissões por setor/módulo.

BEGIN;

-- usuario_ativo só pode revelar o estado do próprio usuário, salvo administradores.
CREATE OR REPLACE FUNCTION public.usuario_ativo(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      p_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.user_id = p_user_id
        AND p.suspenso = false
    )
$$;

REVOKE ALL ON FUNCTION public.usuario_ativo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usuario_ativo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.usuario_ativo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_ativo(uuid) TO service_role;

-- A função de autorização de setor também não precisa ser invocável anonimamente.
REVOKE ALL ON FUNCTION public.usuario_pode_acessar_setor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usuario_pode_acessar_setor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_setor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_setor(uuid) TO service_role;

-- Mantém o bucket de documentos privado mesmo se tiver sido criado manualmente como público.
INSERT INTO storage.buckets (id, name, public)
VALUES ('anexos', 'anexos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Controle persistente e atômico de tentativas de login por CPF/IP.
-- Os identificadores armazenados são HMAC-SHA256, nunca CPF ou IP em texto claro.
CREATE TABLE IF NOT EXISTS public.login_cpf_rate_limits (
  identifier text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_cpf_rate_limits_updated_at_idx
  ON public.login_cpf_rate_limits (updated_at);

ALTER TABLE public.login_cpf_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.login_cpf_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.login_cpf_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.login_cpf_rate_limit(
  p_keys text[],
  p_mode text DEFAULT 'check'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_now timestamptz := now();
  v_limit integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('check', 'failure', 'success')
     OR p_keys IS NULL
     OR cardinality(p_keys) < 1
     OR cardinality(p_keys) > 2
     OR EXISTS (
       SELECT 1
       FROM unnest(p_keys) AS k
       WHERE k !~ '^(cpf|ip):[a-f0-9]{64}$'
     ) THEN
    RAISE EXCEPTION 'Parâmetros de limitação de login inválidos.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.login_cpf_rate_limits
  WHERE updated_at < v_now - interval '30 days';

  IF p_mode = 'success' THEN
    DELETE FROM public.login_cpf_rate_limits
    WHERE identifier = ANY (p_keys);
    RETURN false;
  END IF;

  IF p_mode = 'check' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.login_cpf_rate_limits
      WHERE identifier = ANY (p_keys)
        AND blocked_until > v_now
    );
  END IF;

  FOREACH v_key IN ARRAY p_keys LOOP
    v_limit := CASE WHEN left(v_key, 4) = 'cpf:' THEN 8 ELSE 30 END;

    INSERT INTO public.login_cpf_rate_limits AS current_limit
      (identifier, attempts, window_started_at, blocked_until, updated_at)
    VALUES
      (v_key, 1, v_now, NULL, v_now)
    ON CONFLICT (identifier) DO UPDATE
    SET
      attempts = CASE
        WHEN current_limit.window_started_at <= v_now - interval '15 minutes'
          OR current_limit.blocked_until <= v_now
        THEN 1
        ELSE current_limit.attempts + 1
      END,
      window_started_at = CASE
        WHEN current_limit.window_started_at <= v_now - interval '15 minutes'
          OR current_limit.blocked_until <= v_now
        THEN v_now
        ELSE current_limit.window_started_at
      END,
      blocked_until = CASE
        WHEN (
          CASE
            WHEN current_limit.window_started_at <= v_now - interval '15 minutes'
              OR current_limit.blocked_until <= v_now
            THEN 1
            ELSE current_limit.attempts + 1
          END
        ) >= v_limit
        THEN v_now + interval '15 minutes'
        ELSE NULL
      END,
      updated_at = v_now;
  END LOOP;

  RETURN EXISTS (
    SELECT 1
    FROM public.login_cpf_rate_limits
    WHERE identifier = ANY (p_keys)
      AND blocked_until > v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.login_cpf_rate_limit(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_cpf_rate_limit(text[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_cpf_rate_limit(text[], text) TO service_role;

COMMENT ON FUNCTION public.login_cpf_rate_limit(text[], text) IS
  'Rate limit de login CPF: 8 falhas por CPF ou 30 por IP em janela de 15 minutos; identificadores HMAC. Somente service_role.';

COMMIT;
