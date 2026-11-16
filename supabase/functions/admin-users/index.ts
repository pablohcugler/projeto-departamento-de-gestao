import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | { action: "login-cpf"; cpf: string; senha: string }
  | { action: "list-users" }
  | { action: "create-user"; email: string; senha: string; admin: boolean; setor_id: string; nome?: string }
  | { action: "update-user"; user_id: string; email: string; nome: string; setor_id: string; admin: boolean; suspenso: boolean; nova_senha?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getKeySet(name: string, legacyName: string): string {
  const raw = Deno.env.get(name);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed.default) return parsed.default;
      const first = Object.values(parsed).find(Boolean);
      if (first) return first;
    } catch {
      // Accept a plain key in older deployments.
      return raw;
    }
  }
  return Deno.env.get(legacyName) ?? "";
}

function digits(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function validCpf(value: string) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: string, weight: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) sum += Number(base[i]) * (weight - i);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return calc(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    calc(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

async function createClients() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publicKey = getKeySet("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = getKeySet("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !secretKey) {
    throw new Error("O backend Lovable Cloud não disponibilizou as credenciais Supabase necessárias para a Edge Function.");
  }
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { admin, auth };
}

async function requireAdmin(req: Request, admin: ReturnType<typeof createClient>, publicKey: string) {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new Error("Sessão ausente. Entre novamente no sistema.");
  }
  const token = authorization.slice(7);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, publicKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão inválida ou expirada. Entre novamente.");

  const [{ data: perfil, error: profileError }, { data: role, error: roleError }] = await Promise.all([
    admin.from("user_profiles").select("suspenso,setor_id").eq("user_id", userData.user.id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle(),
  ]);
  if (profileError || roleError) throw new Error(profileError?.message ?? roleError?.message ?? "Não foi possível validar as permissões.");
  if (!perfil || perfil.suspenso) throw new Error("Seu acesso está suspenso ou não possui setor.");
  if (!role) throw new Error("Apenas administradores podem executar esta operação.");
  return { user: userData.user, token };
}

async function handleLoginCpf(
  action: Extract<Action, { action: "login-cpf" }>,
  admin: ReturnType<typeof createClient>,
  auth: ReturnType<typeof createClient>,
) {
  const cpf = digits(action.cpf);
  if (!validCpf(cpf) || !action.senha) {
    return json({ error: "CPF ou senha inválidos." }, 400);
  }

  const { data: perfil, error: perfilError } = await admin
    .from("user_profiles")
    .select("user_id,suspenso")
    .eq("cpf", cpf)
    .maybeSingle();
  if (perfilError || !perfil || perfil.suspenso) {
    return json({ error: "CPF ou senha inválidos." }, 401);
  }

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(perfil.user_id);
  const email = authUser.user?.email;
  if (authUserError || !email) return json({ error: "CPF ou senha inválidos." }, 401);

  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email,
    password: action.senha,
  });
  if (signInError || !signedIn.session) {
    return json({ error: "CPF ou senha inválidos." }, 401);
  }
  return json({
    session: {
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = (await req.json()) as Action;
    const { admin, auth } = await createClients();
    const url = Deno.env.get("SUPABASE_URL")!;
    const publicKey = getKeySet("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");

    if (body?.action === "login-cpf") {
      return await handleLoginCpf(body, admin, auth);
    }

    const { user: solicitante } = await requireAdmin(req, admin, publicKey);

    if (body.action === "list-users") {
      const perPage = 1000;
      const authUsers: Array<{
        id: string;
        email?: string;
        created_at: string;
        last_sign_in_at?: string | null;
        user_metadata?: Record<string, unknown>;
      }> = [];
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        authUsers.push(...data.users);
        if (data.users.length < perPage) break;
      }

      const [{ data: profiles, error: profilesError }, { data: sectors, error: sectorsError }, { data: roles, error: rolesError }] = await Promise.all([
        admin.from("user_profiles").select("user_id,cpf,setor_id,suspenso,created_at"),
        admin.from("setores").select("id,nome,ativo").order("nome"),
        admin.from("user_roles").select("user_id,role"),
      ]);
      if (profilesError || sectorsError || rolesError) {
        throw new Error(profilesError?.message ?? sectorsError?.message ?? rolesError?.message ?? "Falha ao consultar usuários.");
      }
      const profilesById = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const sectorsById = new Map((sectors ?? []).map((s) => [s.id, s.nome]));
      const rolesById = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
      return json({
        setores: sectors ?? [],
        usuarios: authUsers.map((u) => {
          const profile = profilesById.get(u.id);
          return {
            id: u.id,
            email: u.email ?? "",
            nome: String(u.user_metadata?.nome ?? ""),
            cpf: profile?.cpf ?? null,
            setor_id: profile?.setor_id ?? "",
            setor_nome: profile ? sectorsById.get(profile.setor_id) ?? "Setor não encontrado" : "Sem setor",
            suspenso: profile?.suspenso ?? false,
            admin: rolesById.get(u.id) === "admin",
            criado_em: u.created_at,
            ultimo_acesso: u.last_sign_in_at ?? null,
          };
        }),
      });
    }

    if (body.action === "create-user") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const senha = String(body.senha ?? "");
      const setorId = String(body.setor_id ?? "");
      const nome = String(body.nome ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "E-mail inválido." }, 400);
      if (senha.length < 8) return json({ error: "A senha deve ter pelo menos 8 caracteres." }, 400);
      if (!setorId) return json({ error: "Selecione o setor de lotação." }, 400);

      const { data: sector, error: sectorError } = await admin.from("setores").select("id").eq("id", setorId).eq("ativo", true).maybeSingle();
      if (sectorError || !sector) return json({ error: "Setor inválido ou inativo." }, 400);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      });
      if (createError || !created.user) return json({ error: createError?.message ?? "Não foi possível criar o usuário." }, 400);

      const { error: profileError } = await admin.from("user_profiles").insert({
        user_id: created.user.id,
        setor_id: setorId,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: "Não foi possível lotar o usuário no setor: " + profileError.message }, 400);
      }

      const { error: roleError } = await admin.from("user_roles").insert({
        user_id: created.user.id,
        role: body.admin ? "admin" : "user",
      });
      if (roleError) {
        await admin.from("user_profiles").delete().eq("user_id", created.user.id);
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: "Não foi possível definir o perfil de acesso: " + roleError.message }, 400);
      }
      return json({ email: created.user.email, user_id: created.user.id });
    }

    if (body.action === "update-user") {
      const userId = String(body.user_id ?? "");
      const email = String(body.email ?? "").trim().toLowerCase();
      const nome = String(body.nome ?? "").trim();
      const setorId = String(body.setor_id ?? "");
      const novaSenha = String(body.nova_senha ?? "");
      const tornarAdmin = !!body.admin;
      const suspenso = !!body.suspenso;
      if (!userId || !/^\S+@\S+\.\S+$/.test(email) || !setorId) {
        return json({ error: "Usuário, e-mail e setor são obrigatórios." }, 400);
      }
      if (novaSenha && novaSenha.length < 8) return json({ error: "A nova senha deve ter pelo menos 8 caracteres." }, 400);
      if (userId === solicitante.id && suspenso) return json({ error: "Você não pode suspender seu próprio acesso." }, 400);

      const { data: sector, error: sectorError } = await admin.from("setores").select("id").eq("id", setorId).eq("ativo", true).maybeSingle();
      if (sectorError || !sector) return json({ error: "Setor inválido ou inativo." }, 400);

      const { data: targetRole, error: targetRoleError } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (targetRoleError) throw targetRoleError;
      if (targetRole && (!tornarAdmin || suspenso)) {
        const { count, error: countError } = await admin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
        if (countError) throw countError;
        if ((count ?? 0) <= 1) return json({ error: "O sistema precisa manter pelo menos um administrador ativo." }, 400);
      }

      const { data: current, error: currentError } = await admin.auth.admin.getUserById(userId);
      if (currentError || !current.user) return json({ error: "Usuário não encontrado." }, 404);

      const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
        email,
        user_metadata: { ...current.user.user_metadata, nome },
        ...(novaSenha ? { password: novaSenha } : {}),
        ban_duration: suspenso ? "876000h" : "none",
      });
      if (authUpdateError) throw authUpdateError;

      const { error: profileError } = await admin.from("user_profiles").update({
        setor_id: setorId,
        suspenso,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      if (profileError) throw profileError;

      const { error: removeRoleError } = await admin.from("user_roles").delete().eq("user_id", userId);
      if (removeRoleError) throw removeRoleError;
      const { error: insertRoleError } = await admin.from("user_roles").insert({
        user_id: userId,
        role: tornarAdmin ? "admin" : "user",
      });
      if (insertRoleError) throw insertRoleError;

      return json({ sucesso: true });
    }

    return json({ error: "Ação administrativa desconhecida." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("admin-users", message);
    const status = /sessão ausente|sessão inválida|apenas administradores|acesso suspenso/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
