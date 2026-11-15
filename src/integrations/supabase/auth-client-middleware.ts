import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

/**
 * A sessão do Supabase fica no navegador. Encaminha explicitamente o JWT
 * para as Server Functions que validam o cabeçalho Authorization no servidor.
 */
export const forwardSupabaseAccessToken = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (error || !token) {
      throw new Error("Sua sessão expirou. Entre novamente no sistema e tente importar o arquivo.");
    }

    return next({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
);
