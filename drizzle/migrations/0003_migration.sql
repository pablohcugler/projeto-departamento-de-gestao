CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

DROP POLICY "own atas" ON public.atas;
CREATE POLICY "team reads atas" ON public.atas FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert atas" ON public.atas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner or admin updates atas" ON public.atas FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owner or admin deletes atas" ON public.atas FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

DROP POLICY "own itens" ON public.ata_itens;
CREATE POLICY "team reads itens" ON public.ata_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert itens" ON public.ata_itens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner or admin updates itens" ON public.ata_itens FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owner or admin deletes itens" ON public.ata_itens FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

DROP POLICY "own contratos" ON public.contratos;
CREATE POLICY "team reads contratos" ON public.contratos FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert contratos" ON public.contratos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner or admin updates contratos" ON public.contratos FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owner or admin deletes contratos" ON public.contratos FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

DROP POLICY "own classificacoes" ON public.classificacoes;
CREATE POLICY "team reads classificacoes" ON public.classificacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert classificacoes" ON public.classificacoes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner or admin updates classificacoes" ON public.classificacoes FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owner or admin deletes classificacoes" ON public.classificacoes FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));