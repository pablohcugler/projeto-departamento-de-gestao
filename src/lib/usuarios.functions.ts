import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function apenasDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

export const entrarComCpf = createServerFn({ method: "POST" })
  .inputValidator((input: { cpf: string; senha: string }) => {
    const cpf = apenasDigitos(String(input?.cpf ?? ""));
    const senha = String(input?.senha ?? "");
    if (cpf.length !== 11 || !senha) throw new Error("CPF ou senha inválidos.");
    return { cpf, senha };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id,suspenso")
      .eq("cpf", data.cpf)
      .maybeSingle();

    // A mesma mensagem evita revelar se um CPF está ou não cadastrado.
    if (perfilError || !perfil || perfil.suspenso) {
      throw new Error("CPF ou senha inválidos.");
    }

    const { data: usuario, error: usuarioError } = await supabaseAdmin.auth.admin.getUserById(perfil.user_id);
    const email = usuario?.user?.email;
    if (usuarioError || !email) throw new Error("CPF ou senha inválidos.");

    const url = process.env["SUPABASE_URL"];
    const chave = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !chave) throw new Error("Serviço de autenticação indisponível.");

    const clienteAuth = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: autenticacao, error } = await clienteAuth.auth.signInWithPassword({
      email,
      password: data.senha,
    });
    if (error || !autenticacao.session) throw new Error("CPF ou senha inválidos.");

    return {
      access_token: autenticacao.session.access_token,
      refresh_token: autenticacao.session.refresh_token,
    };
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; senha: string; admin: boolean; setor_id: string; nome?: string }) => {
    if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error("E-mail inválido.");
    if (!input.senha || input.senha.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
    if (!input.setor_id) throw new Error("Selecione o setor do usuário.");
    return {
      email: input.email.trim().toLowerCase(),
      senha: input.senha,
      admin: !!input.admin,
      setor_id: input.setor_id,
      nome: String(input.nome ?? "").trim(),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas o administrador pode cadastrar usuários.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error || !criado.user) throw new Error(error?.message ?? "Não foi possível criar o usuário.");

    const { error: perfilError } = await supabaseAdmin.from("user_profiles").insert({
      user_id: criado.user.id,
      setor_id: data.setor_id,
    });
    if (perfilError) {
      await supabaseAdmin.auth.admin.deleteUser(criado.user.id);
      throw new Error("Não foi possível lotar o usuário no setor escolhido: " + perfilError.message);
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: criado.user.id,
      role: data.admin ? "admin" : "user",
    });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(criado.user.id);
      throw new Error("Não foi possível definir o perfil de acesso: " + roleError.message);
    }
    return { email: criado.user.email };
  });

export const listarUsuariosAdministracao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas administradores podem consultar os usuários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: authResult, error: authError }, { data: perfis, error: perfilError }, { data: setores, error: setorError }, { data: papeis, error: roleError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("user_profiles").select("user_id,cpf,setor_id,suspenso,created_at"),
      supabaseAdmin.from("setores").select("id,nome,ativo").order("nome"),
      supabaseAdmin.from("user_roles").select("user_id,role"),
    ]);
    if (authError || perfilError || setorError || roleError) {
      throw new Error(authError?.message ?? perfilError?.message ?? setorError?.message ?? roleError?.message ?? "Não foi possível carregar os usuários.");
    }

    const perfisPorId = new Map((perfis ?? []).map((p) => [p.user_id, p]));
    const setoresPorId = new Map((setores ?? []).map((s) => [s.id, s.nome]));
    const papeisPorId = new Map((papeis ?? []).map((p) => [p.user_id, p.role]));
    return {
      setores: setores ?? [],
      usuarios: (authResult?.users ?? []).map((u) => {
        const p = perfisPorId.get(u.id);
        return {
          id: u.id,
          email: u.email ?? "",
          nome: String(u.user_metadata?.nome ?? ""),
          cpf: p?.cpf ?? null,
          setor_id: p?.setor_id ?? "",
          setor_nome: p ? setoresPorId.get(p.setor_id) ?? "Setor não encontrado" : "Sem setor",
          suspenso: p?.suspenso ?? false,
          admin: papeisPorId.get(u.id) === "admin",
          criado_em: u.created_at,
          ultimo_acesso: u.last_sign_in_at ?? null,
        };
      }),
    };
  });

export const atualizarUsuarioAdministrativamente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    user_id: string;
    email: string;
    nome: string;
    setor_id: string;
    admin: boolean;
    suspenso: boolean;
    nova_senha?: string;
  }) => {
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("E-mail inválido.");
    if (!input.user_id || !input.setor_id) throw new Error("Usuário e setor são obrigatórios.");
    const nova_senha = String(input.nova_senha ?? "");
    if (nova_senha && nova_senha.length < 8) throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
    return {
      user_id: input.user_id,
      email,
      nome: String(input.nome ?? "").trim(),
      setor_id: input.setor_id,
      admin: !!input.admin,
      suspenso: !!input.suspenso,
      nova_senha,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas administradores podem editar usuários.");
    if (data.user_id === context.userId && data.suspenso) {
      throw new Error("Você não pode suspender seu próprio acesso.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atual, error: getError } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (getError || !atual.user) throw new Error("Usuário não encontrado.");

    if (!data.admin && data.user_id !== context.userId) {
      const { count, error: countError } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) <= 1) throw new Error("O sistema precisa manter pelo menos um administrador.");
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      email: data.email,
      user_metadata: { ...atual.user.user_metadata, nome: data.nome },
      ...(data.nova_senha ? { password: data.nova_senha } : {}),
      ban_duration: data.suspenso ? "876000h" : "none",
    });
    if (updateAuthError) throw new Error(updateAuthError.message);

    const { error: profileError } = await supabaseAdmin.from("user_profiles").update({
      setor_id: data.setor_id,
      suspenso: data.suspenso,
      updated_at: new Date().toISOString(),
    }).eq("user_id", data.user_id);
    if (profileError) throw new Error(profileError.message);

    const { error: deleteRoleError } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    if (deleteRoleError) throw new Error(deleteRoleError.message);
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: data.user_id,
      role: data.admin ? "admin" : "user",
    });
    if (roleError) throw new Error(roleError.message);

    return { sucesso: true };
  });
