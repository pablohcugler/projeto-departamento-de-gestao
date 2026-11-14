import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; senha: string; admin: boolean }) => {
    if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error("E-mail inválido.");
    if (!input.senha || input.senha.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
    return { email: input.email.trim().toLowerCase(), senha: input.senha, admin: !!input.admin };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas o administrador pode cadastrar usuários.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: criado.user.id, role: data.admin ? "admin" : "user" });
    if (roleErr) throw new Error("Usuário criado, mas falhou ao liberar o acesso à equipe.");
    return { email: criado.user.email };
  });
