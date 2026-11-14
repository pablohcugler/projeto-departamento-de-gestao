CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id);

DROP POLICY "team reads atas" ON public.atas;
CREATE POLICY "team reads atas" ON public.atas FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY "team reads itens" ON public.ata_itens;
CREATE POLICY "team reads itens" ON public.ata_itens FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY "team reads contratos" ON public.contratos;
CREATE POLICY "team reads contratos" ON public.contratos FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY "team reads classificacoes" ON public.classificacoes;
CREATE POLICY "team reads classificacoes" ON public.classificacoes FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY "team reads anexos" ON public.anexos;
CREATE POLICY "team reads anexos" ON public.anexos FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY "team reads anexos files" ON storage.objects;
CREATE POLICY "team reads anexos files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'anexos' AND public.is_team_member(auth.uid()));