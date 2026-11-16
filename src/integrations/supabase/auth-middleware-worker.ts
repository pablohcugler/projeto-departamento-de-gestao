import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createSupabaseFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      (apiKey.startsWith("sb_publishable_") || apiKey.startsWith("sb_secret_")) &&
      headers.get("Authorization") === `Bearer ${apiKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Autenticação dedicada às Server Functions executadas no Cloudflare.
 * Usa bindings do Worker quando configurados e, como fallback, as mesmas
 * variáveis VITE_* já injetadas no bundle do cliente pelo build do projeto.
 */
export const requireSupabaseAuthForWorker = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const supabaseUrl =
      process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
    const supabaseKey =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ||
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

    if (!supabaseUrl || !supabaseKey) {
      const missing = [
        ...(!supabaseUrl ? ["SUPABASE_URL / VITE_SUPABASE_URL"] : []),
        ...(!supabaseKey
          ? ["SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PUBLISHABLE_KEY"]
          : []),
      ];
      throw new Error(
        `Missing Supabase environment variable(s): ${missing.join(", ")}. Configure Supabase connection variables for the Cloudflare build.`,
      );
    }

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Unauthorized: No valid Bearer token was provided.");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token || token.split(".").length !== 3) {
      throw new Error("Unauthorized: Invalid token.");
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      global: {
        fetch: createSupabaseFetch(supabaseKey),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      throw new Error("Unauthorized: Invalid token.");
    }

    const { data: perfil, error: perfilError } = await supabase
      .from("user_profiles")
      .select("suspenso,setor_id")
      .eq("user_id", data.claims.sub)
      .maybeSingle();
    if (perfilError || !perfil || perfil.suspenso || !perfil.setor_id) {
      throw new Error("Acesso suspenso ou usuário sem setor. Procure o administrador.");
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);
