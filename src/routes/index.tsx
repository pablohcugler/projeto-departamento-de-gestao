import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm } from "@/components/atas/AuthForm";
import { CompletarCpf } from "@/components/atas/CompletarCpf";
import { Painel } from "@/components/atas/Painel";

type PerfilUsuario = { cpf: string | null; setor_id: string; suspenso: boolean };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Departamento de Gestão em Saúde" },
      { name: "description", content: "Gerenciamento geral do Departamento: atas de registro de preço e contratos com alertas de vencimento." },
      { property: "og:title", content: "Departamento de Gestão em Saúde" },
      { property: "og:description", content: "Gerenciamento geral do Departamento: atas de registro de preço e contratos com alertas de vencimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<PerfilUsuario | null | undefined>(undefined);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao);
      setPerfil(undefined);
    });
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let ativo = true;
    if (!session?.user.id) {
      setPerfil(null);
      return () => { ativo = false; };
    }
    void supabase
      .from("user_profiles")
      .select("cpf,setor_id,suspenso")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!ativo) return;
        if (error || !data) {
          setPerfil(null);
          return;
        }
        if (data.suspenso) {
          await supabase.auth.signOut();
          setPerfil(null);
          return;
        }
        setPerfil(data);
      });
    return () => { ativo = false; };
  }, [session?.user.id]);

  if (session === undefined) return <div className="min-h-screen bg-background" />;
  if (!session) return <AuthForm />;
  if (perfil === undefined) return <div className="min-h-screen bg-background" />;
  if (!perfil || !perfil.setor_id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">Acesso não configurado</h1>
          <p className="mt-2 text-sm text-muted-foreground">Seu usuário ainda não está lotado em um setor. Entre em contato com o administrador.</p>
          <button className="mt-4 text-sm text-primary underline" onClick={() => void supabase.auth.signOut()}>Sair do sistema</button>
        </div>
      </div>
    );
  }
  if (!perfil.cpf) {
    return (
      <CompletarCpf
        nome={session.user.user_metadata?.nome as string | undefined}
        onConcluido={(cpf) => setPerfil({ ...perfil, cpf })}
      />
    );
  }
  return <Painel nome={session.user.user_metadata?.nome as string | undefined} userId={session.user.id} />;
}
