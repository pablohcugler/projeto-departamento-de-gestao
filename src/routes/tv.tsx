import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm } from "@/components/atas/AuthForm";
import { TelaTv } from "@/components/tv/TelaTv";

export const Route = createFileRoute("/tv")({
  head: () => ({
    meta: [
      { title: "Tela da TV — Vencimentos | Gestão em Saúde" },
      { name: "description", content: "Painel para TV com atas e contratos próximos do vencimento." },
      { property: "og:title", content: "Tela da TV — Vencimentos" },
      { property: "og:description", content: "Painel para TV com atas e contratos próximos do vencimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Tv,
});

function Tv() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="min-h-screen bg-background" />;
  if (!session) return <AuthForm />;
  return <TelaTv />;
}
