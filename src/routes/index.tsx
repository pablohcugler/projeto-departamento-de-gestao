import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm } from "@/components/atas/AuthForm";
import { Painel } from "@/components/atas/Painel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atas de Registro de Preço — Controle de Vencimentos" },
      { name: "description", content: "Cadastre atas de registro de preço, itens e valores, e receba alertas de vencimento." },
      { property: "og:title", content: "Atas de Registro de Preço — Controle de Vencimentos" },
      { property: "og:description", content: "Cadastre atas de registro de preço, itens e valores, e receba alertas de vencimento." },
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
  return <Painel email={session.user.email ?? ""} />;
}
