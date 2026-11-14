import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm } from "@/components/atas/AuthForm";
import { Painel } from "@/components/atas/Painel";

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
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="min-h-screen bg-background" />;
  if (!session) return <AuthForm />;
  return <Painel email={session.user.email ?? ""} userId={session.user.id} />;
}
