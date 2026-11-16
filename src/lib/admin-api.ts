import { supabase } from "@/integrations/supabase/client";

export async function adminApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    const contexto = (error as { context?: Response }).context;
    if (contexto && typeof contexto.clone === "function") {
      const detalhe = await contexto.clone().json().catch(() => null) as { error?: string } | null;
      if (detalhe?.error) throw new Error(detalhe.error);
    }
    throw new Error(error.message || "Falha ao comunicar com o serviço administrativo do Lovable Cloud.");
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}
