-- Setores, perfil dos usuários, segregação de dados e pedidos persistentes.
-- Dados históricos são atribuídos inicialmente ao setor Aquisições para preservar o acesso.

CREATE TABLE IF NOT EXISTS public.setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.setores (nome)
VALUES ('Aquisições'), ('Farmácia'), ('Almoxarifado')
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cpf text UNIQUE,
  setor_id uuid NOT NULL REFERENCES public.setores(id),
  suspenso boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Usuários já existentes recebem inicialmente Aquisições e deverão informar CPF
-- na próxima autenticação. O administrador poderá realocá-los.
INSERT INTO public.user_profiles (user_id, setor_id)
SELECT u.id, s.id
FROM auth.users u
CROSS JOIN public.setores s
WHERE s.nome = 'Aquisições'
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.atas ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores(id);
ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores(id);
ALTER TABLE public.classificacoes ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores(id);

UPDATE public.atas
SET setor_id = (SELECT id FROM public.setores WHERE nome = 'Aquisições')
WHERE setor_id IS NULL;

UPDATE public.contratos
SET setor_id = (SELECT id FROM public.setores WHERE nome = 'Aquisições')
WHERE setor_id IS NULL;

UPDATE public.classificacoes
SET setor_id = (SELECT id FROM public.setores WHERE nome = 'Aquisições')
WHERE setor_id IS NULL;

ALTER TABLE public.atas ALTER COLUMN setor_id SET NOT NULL;
ALTER TABLE public.contratos ALTER COLUMN setor_id SET NOT NULL;
ALTER TABLE public.classificacoes ALTER COLUMN setor_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.current_user_setor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.setor_id
  FROM public.user_profiles p
  WHERE p.user_id = auth.uid() AND p.suspenso = false
  LIMIT 1
$$;

ALTER TABLE public.atas ALTER COLUMN setor_id SET DEFAULT public.current_user_setor_id();
ALTER TABLE public.contratos ALTER COLUMN setor_id SET DEFAULT public.current_user_setor_id();
ALTER TABLE public.classificacoes ALTER COLUMN setor_id SET DEFAULT public.current_user_setor_id();

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
      WHERE p.user_id = auth.uid()
        AND p.suspenso = false
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR p.setor_id = p_setor_id
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.usuario_ativo(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.user_id = p_user_id AND p.suspenso = false
  )
$$;

CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_referencia(p_ref_tipo text, p_ref_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_id uuid;
BEGIN
  IF p_ref_tipo = 'ata' THEN
    SELECT a.setor_id INTO v_setor_id FROM public.atas a WHERE a.id = p_ref_id;
  ELSIF p_ref_tipo = 'contrato' THEN
    SELECT c.setor_id INTO v_setor_id FROM public.contratos c WHERE c.id = p_ref_id;
  ELSE
    RETURN false;
  END IF;

  RETURN v_setor_id IS NOT NULL AND public.usuario_pode_acessar_setor(v_setor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_arquivo_anexo(p_caminho text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_id uuid;
BEGIN
  v_tipo := split_part(p_caminho, '/', 1);
  BEGIN
    v_id := split_part(p_caminho, '/', 2)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN public.usuario_pode_acessar_referencia(v_tipo, v_id);
END;
$$;

-- CPF: gravação exclusivamente para o usuário autenticado; não permite
-- alterar o CPF depois do primeiro cadastro.
CREATE OR REPLACE FUNCTION public.registrar_cpf_usuario(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf text;
  v_soma integer := 0;
  v_digito1 integer;
  v_digito2 integer;
  i integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_ativo(auth.uid()) THEN
    RAISE EXCEPTION 'Usuário não autorizado.';
  END IF;

  v_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  IF length(v_cpf) <> 11 OR v_cpf ~ '^([0-9])\1{10}$' THEN
    RAISE EXCEPTION 'CPF inválido.';
  END IF;

  FOR i IN 1..9 LOOP
    v_soma := v_soma + substring(v_cpf, i, 1)::integer * (11 - i);
  END LOOP;
  v_digito1 := (v_soma * 10) % 11;
  IF v_digito1 = 10 THEN v_digito1 := 0; END IF;
  IF v_digito1 <> substring(v_cpf, 10, 1)::integer THEN
    RAISE EXCEPTION 'CPF inválido.';
  END IF;

  v_soma := 0;
  FOR i IN 1..10 LOOP
    v_soma := v_soma + substring(v_cpf, i, 1)::integer * (12 - i);
  END LOOP;
  v_digito2 := (v_soma * 10) % 11;
  IF v_digito2 = 10 THEN v_digito2 := 0; END IF;
  IF v_digito2 <> substring(v_cpf, 11, 1)::integer THEN
    RAISE EXCEPTION 'CPF inválido.';
  END IF;

  UPDATE public.user_profiles
  SET cpf = v_cpf, updated_at = now()
  WHERE user_id = auth.uid() AND cpf IS NULL;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND cpf = v_cpf) THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'O CPF já foi cadastrado e não pode ser alterado. Procure o administrador.';
  END IF;

  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Este CPF já está vinculado a outro usuário.';
END;
$$;

-- Tabela de pedidos: o conteúdo dos itens é salvo como fotografia do pedido,
-- preservando descrição, fornecedor, quantidade e preço no momento da emissão.
CREATE TABLE IF NOT EXISTS public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  setor_id uuid NOT NULL REFERENCES public.setores(id),
  ata_id uuid NOT NULL REFERENCES public.atas(id),
  justificativa text NOT NULL,
  itens jsonb NOT NULL CHECK (jsonb_typeof(itens) = 'array' AND jsonb_array_length(itens) > 0),
  total numeric(16,2) NOT NULL CHECK (total >= 0),
  data_saldo date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atas_setor_idx ON public.atas(setor_id);
CREATE INDEX IF NOT EXISTS contratos_setor_idx ON public.contratos(setor_id);
CREATE INDEX IF NOT EXISTS classificacoes_setor_idx ON public.classificacoes(setor_id);
CREATE INDEX IF NOT EXISTS pedidos_setor_created_idx ON public.pedidos(setor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pedidos_ata_idx ON public.pedidos(ata_id);

GRANT SELECT ON public.setores TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_setor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_setor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_ativo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_referencia(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_arquivo_anexo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_cpf_usuario(text) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO authenticated;
GRANT ALL ON public.setores, public.user_profiles, public.pedidos TO service_role;

ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read sectors" ON public.setores;
CREATE POLICY "authenticated read sectors" ON public.setores
FOR SELECT TO authenticated USING (public.usuario_ativo(auth.uid()));

DROP POLICY IF EXISTS "own profile or admin reads" ON public.user_profiles;
CREATE POLICY "own profile or admin reads" ON public.user_profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- O CPF, setor e status só podem ser alterados pelo serviço administrativo
-- (service_role) ou pela função registrar_cpf_usuario para o próprio usuário.

-- Atas
DROP POLICY IF EXISTS "team reads atas" ON public.atas;
DROP POLICY IF EXISTS "insert atas" ON public.atas;
DROP POLICY IF EXISTS "owner or admin updates atas" ON public.atas;
DROP POLICY IF EXISTS "owner or admin deletes atas" ON public.atas;
DROP POLICY IF EXISTS "sector reads atas" ON public.atas;
DROP POLICY IF EXISTS "sector inserts atas" ON public.atas;
DROP POLICY IF EXISTS "sector updates atas" ON public.atas;
DROP POLICY IF EXISTS "sector deletes atas" ON public.atas;

CREATE POLICY "sector reads atas" ON public.atas
FOR SELECT TO authenticated USING (public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector inserts atas" ON public.atas
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector updates atas" ON public.atas
FOR UPDATE TO authenticated
USING (public.usuario_pode_acessar_setor(setor_id))
WITH CHECK (public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector deletes atas" ON public.atas
FOR DELETE TO authenticated USING (public.usuario_pode_acessar_setor(setor_id));

-- Itens herdam o setor da ata à qual pertencem.
DROP POLICY IF EXISTS "team reads itens" ON public.ata_itens;
DROP POLICY IF EXISTS "insert itens" ON public.ata_itens;
DROP POLICY IF EXISTS "owner or admin updates itens" ON public.ata_itens;
DROP POLICY IF EXISTS "owner or admin deletes itens" ON public.ata_itens;
DROP POLICY IF EXISTS "sector reads ata items" ON public.ata_itens;
DROP POLICY IF EXISTS "sector inserts ata items" ON public.ata_itens;
DROP POLICY IF EXISTS "sector updates ata items" ON public.ata_itens;
DROP POLICY IF EXISTS "sector deletes ata items" ON public.ata_itens;

CREATE POLICY "sector reads ata items" ON public.ata_itens
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.atas a WHERE a.id = ata_itens.ata_id AND public.usuario_pode_acessar_setor(a.setor_id)
));
CREATE POLICY "sector inserts ata items" ON public.ata_itens
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.atas a WHERE a.id = ata_itens.ata_id AND public.usuario_pode_acessar_setor(a.setor_id)
  )
);
CREATE POLICY "sector updates ata items" ON public.ata_itens
FOR UPDATE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.atas a WHERE a.id = ata_itens.ata_id AND public.usuario_pode_acessar_setor(a.setor_id)
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.atas a WHERE a.id = ata_itens.ata_id AND public.usuario_pode_acessar_setor(a.setor_id)
));
CREATE POLICY "sector deletes ata items" ON public.ata_itens
FOR DELETE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.atas a WHERE a.id = ata_itens.ata_id AND public.usuario_pode_acessar_setor(a.setor_id)
));

-- Contratos
DROP POLICY IF EXISTS "team reads contratos" ON public.contratos;
DROP POLICY IF EXISTS "insert contratos" ON public.contratos;
DROP POLICY IF EXISTS "owner or admin updates contratos" ON public.contratos;
DROP POLICY IF EXISTS "owner or admin deletes contratos" ON public.contratos;
DROP POLICY IF EXISTS "sector reads contratos" ON public.contratos;
DROP POLICY IF EXISTS "sector inserts contratos" ON public.contratos;
DROP POLICY IF EXISTS "sector updates contratos" ON public.contratos;
DROP POLICY IF EXISTS "sector deletes contratos" ON public.contratos;

CREATE POLICY "sector reads contratos" ON public.contratos
FOR SELECT TO authenticated USING (public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector inserts contratos" ON public.contratos
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector updates contratos" ON public.contratos
FOR UPDATE TO authenticated USING (public.usuario_pode_acessar_setor(setor_id))
WITH CHECK (public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector deletes contratos" ON public.contratos
FOR DELETE TO authenticated USING (public.usuario_pode_acessar_setor(setor_id));

-- Classificações passam a ser definidas por setor.
DROP POLICY IF EXISTS "team reads classificacoes" ON public.classificacoes;
DROP POLICY IF EXISTS "insert classificacoes" ON public.classificacoes;
DROP POLICY IF EXISTS "owner or admin updates classificacoes" ON public.classificacoes;
DROP POLICY IF EXISTS "owner or admin deletes classificacoes" ON public.classificacoes;
DROP POLICY IF EXISTS "sector reads classificacoes" ON public.classificacoes;
DROP POLICY IF EXISTS "sector inserts classificacoes" ON public.classificacoes;
DROP POLICY IF EXISTS "sector updates classificacoes" ON public.classificacoes;
DROP POLICY IF EXISTS "sector deletes classificacoes" ON public.classificacoes;

CREATE POLICY "sector reads classificacoes" ON public.classificacoes
FOR SELECT TO authenticated USING (public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector inserts classificacoes" ON public.classificacoes
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector updates classificacoes" ON public.classificacoes
FOR UPDATE TO authenticated USING (public.usuario_pode_acessar_setor(setor_id))
WITH CHECK (public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector deletes classificacoes" ON public.classificacoes
FOR DELETE TO authenticated USING (public.usuario_pode_acessar_setor(setor_id));

-- Anexos só podem ser lidos e modificados por pessoas do setor do registro.
DROP POLICY IF EXISTS "team reads anexos" ON public.anexos;
DROP POLICY IF EXISTS "insert anexos" ON public.anexos;
DROP POLICY IF EXISTS "owner or admin deletes anexos" ON public.anexos;
DROP POLICY IF EXISTS "sector reads anexos" ON public.anexos;
DROP POLICY IF EXISTS "sector inserts anexos" ON public.anexos;
DROP POLICY IF EXISTS "sector deletes anexos" ON public.anexos;

CREATE POLICY "sector reads anexos" ON public.anexos
FOR SELECT TO authenticated USING (public.usuario_pode_acessar_referencia(ref_tipo, ref_id));
CREATE POLICY "sector inserts anexos" ON public.anexos
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.usuario_pode_acessar_referencia(ref_tipo, ref_id));
CREATE POLICY "sector deletes anexos" ON public.anexos
FOR DELETE TO authenticated USING (public.usuario_pode_acessar_referencia(ref_tipo, ref_id));

-- O bucket também respeita o setor, tanto para download assinado quanto para upload.
DROP POLICY IF EXISTS "team reads anexos files" ON storage.objects;
DROP POLICY IF EXISTS "team uploads anexos files" ON storage.objects;
DROP POLICY IF EXISTS "owner or admin deletes anexos files" ON storage.objects;
DROP POLICY IF EXISTS "sector reads anexos files" ON storage.objects;
DROP POLICY IF EXISTS "sector uploads anexos files" ON storage.objects;
DROP POLICY IF EXISTS "sector deletes anexos files" ON storage.objects;

CREATE POLICY "sector reads anexos files" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'anexos' AND public.usuario_pode_acessar_arquivo_anexo(name)
);
CREATE POLICY "sector uploads anexos files" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'anexos' AND owner = auth.uid() AND public.usuario_pode_acessar_arquivo_anexo(name)
);
CREATE POLICY "sector deletes anexos files" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'anexos' AND public.usuario_pode_acessar_arquivo_anexo(name)
);

-- Pedidos: cada usuário vê seu setor; administradores têm acesso transversal.
CREATE POLICY "sector reads pedidos" ON public.pedidos
FOR SELECT TO authenticated USING (public.usuario_pode_acessar_setor(setor_id));
CREATE POLICY "sector inserts pedidos" ON public.pedidos
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.usuario_pode_acessar_setor(setor_id)
  AND EXISTS (SELECT 1 FROM public.atas a WHERE a.id = ata_id AND a.setor_id = pedidos.setor_id)
);
CREATE POLICY "sector deletes pedidos" ON public.pedidos
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND public.usuario_pode_acessar_setor(setor_id))
);

REVOKE ALL ON FUNCTION public.registrar_cpf_usuario(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_cpf_usuario(text) TO authenticated;


-- Mantém a atualização de saldo limitada ao setor da ata e bloqueia perfis suspensos.
CREATE OR REPLACE FUNCTION public.atualizar_saldos_ata(
  p_ata_id uuid,
  p_data_relatorio date,
  p_saldos jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atualizados integer := 0;
  v_setor_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_ativo(auth.uid()) OR NOT public.is_team_member(auth.uid()) THEN
    RAISE EXCEPTION 'Usuário sem permissão para atualizar saldo da ata.';
  END IF;

  SELECT a.setor_id INTO v_setor_id FROM public.atas a WHERE a.id = p_ata_id;
  IF v_setor_id IS NULL OR NOT public.usuario_pode_acessar_setor(v_setor_id) THEN
    RAISE EXCEPTION 'Você não tem acesso ao setor desta ata.';
  END IF;

  IF p_data_relatorio IS NULL
     OR p_data_relatorio <> (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'O relatório precisa ter a data de hoje.';
  END IF;

  IF jsonb_typeof(p_saldos) <> 'array' THEN
    RAISE EXCEPTION 'Lista de saldos inválida.';
  END IF;

  UPDATE public.ata_itens AS ai
  SET saldo_disponivel = s.saldo,
      saldo_atualizado_em = p_data_relatorio
  FROM jsonb_to_recordset(p_saldos) AS s(item_id uuid, saldo numeric)
  WHERE ai.id = s.item_id
    AND ai.ata_id = p_ata_id
    AND s.saldo >= 0;

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RETURN v_atualizados;
END;
$$;

DROP POLICY IF EXISTS "Usuários enviam feedback próprio" ON public.feedbacks_sistema;
DROP POLICY IF EXISTS "Feedbacks ativos da equipe" ON public.feedbacks_sistema;
CREATE POLICY "Feedbacks ativos da equipe" ON public.feedbacks_sistema
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.usuario_ativo(auth.uid()));
