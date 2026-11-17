import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { strToU8, zipSync } from "npm:fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

type Action =
  | { action: "login-cpf"; cpf: string; senha: string }
  | { action: "list-users" }
  | { action: "create-user"; email: string; senha: string; admin: boolean; setor_id: string; nome?: string }
  | { action: "update-user"; user_id: string; email: string; nome: string; setor_id: string; admin: boolean; suspenso: boolean; nova_senha?: string }
  | { action: "list-atas-admin" }
  | { action: "delete-atas-admin"; ata_ids: string[] }
  | { action: "export-backup" };

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
  return { admin, auth, url, publicKey };
}

export async function requireAdmin(req: Request, url: string, publicKey: string, clientFactory: typeof createClient = createClient) {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new Error("Sessão ausente. Entre novamente no sistema.");
  }
  const token = authorization.slice(7);
  const caller = clientFactory(url, publicKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Sessão inválida ou expirada. Entre novamente.");

  const [{ data: perfil, error: profileError }, { data: role, error: roleError }] = await Promise.all([
    caller.from("user_profiles").select("suspenso,setor_id").eq("user_id", userData.user.id).maybeSingle(),
    caller.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle(),
  ]);
  if (profileError || roleError) throw new Error(profileError?.message ?? roleError?.message ?? "Não foi possível validar as permissões.");
  if (!perfil || perfil.suspenso || !perfil.setor_id) throw new Error("Seu acesso está suspenso ou não possui setor.");
  if (!role) throw new Error("Apenas administradores podem executar esta operação.");
  return { user: userData.user, token };
}

async function handleLoginCpf(
  action: Extract<Action, { action: "login-cpf" }>,
  admin: SupabaseClient,
  auth: SupabaseClient,
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


const BACKUP_TABLES = [
  "atas",
  "ata_itens",
  "anexos",
  "contratos",
  "classificacoes",
  "feedbacks_sistema",
  "pedidos",
  "setores",
  "user_profiles",
  "user_roles",
] as const;

async function selectAllRows(admin: SupabaseClient, table: string) {
  const client = admin as unknown as {
    from: (name: string) => {
      select: (columns: string) => {
        range: (from: number, to: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
  const rows: unknown[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from(table).select("*").range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Falha ao exportar a tabela ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function listarAtasAdministrativas(admin: SupabaseClient) {
  const [{ data: atas, error: atasError }, { data: pedidos, error: pedidosError }] = await Promise.all([
    admin.from("atas").select("id,numero,objeto,data_vencimento,situacao_cadastro,setor_id,created_at").order("created_at", { ascending: false }),
    admin.from("pedidos").select("ata_id"),
  ]);
  if (atasError || pedidosError) {
    throw new Error(atasError?.message ?? pedidosError?.message ?? "Não foi possível consultar as atas.");
  }
  const contagem = new Map<string, number>();
  for (const pedido of pedidos ?? []) {
    contagem.set(pedido.ata_id, (contagem.get(pedido.ata_id) ?? 0) + 1);
  }
  return (atas ?? []).map((ata) => ({ ...ata, pedidos_vinculados: contagem.get(ata.id) ?? 0 }));
}

async function excluirAtasAdministrativamente(admin: SupabaseClient, idsRecebidos: string[]) {
  const ids = [...new Set(idsRecebidos.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length || ids.length > 100) throw new Error("Selecione entre 1 e 100 atas por operação.");

  const { data: existentes, error: atasLookupError } = await admin.from("atas").select("id").in("id", ids);
  if (atasLookupError) throw atasLookupError;
  if ((existentes ?? []).length !== ids.length) throw new Error("Uma ou mais atas selecionadas não foram encontradas. Atualize a lista e tente novamente.");

  const [{ data: pedidos, error: pedidosLookupError }, { data: anexos, error: anexosLookupError }] = await Promise.all([
    admin.from("pedidos").select("id").in("ata_id", ids),
    admin.from("anexos").select("id,caminho").eq("ref_tipo", "ata").in("ref_id", ids),
  ]);
  if (pedidosLookupError || anexosLookupError) {
    throw new Error(pedidosLookupError?.message ?? anexosLookupError?.message ?? "Não foi possível conferir os vínculos das atas.");
  }

  const { error: apagarPedidosError } = await admin.from("pedidos").delete().in("ata_id", ids);
  if (apagarPedidosError) throw new Error("Falha ao excluir pedidos vinculados: " + apagarPedidosError.message);

  const { error: apagarItensError } = await admin.from("ata_itens").delete().in("ata_id", ids);
  if (apagarItensError) throw new Error("Falha ao excluir itens das atas: " + apagarItensError.message);

  const { error: apagarAnexosError } = await admin.from("anexos").delete().eq("ref_tipo", "ata").in("ref_id", ids);
  if (apagarAnexosError) throw new Error("Falha ao excluir os registros de anexos: " + apagarAnexosError.message);

  const { error: apagarAtasError } = await admin.from("atas").delete().in("id", ids);
  if (apagarAtasError) throw new Error("Falha ao excluir as atas: " + apagarAtasError.message);

  const caminhos = (anexos ?? []).map((anexo) => anexo.caminho).filter((path): path is string => !!path);
  const avisos: string[] = [];
  let arquivosRemovidos = 0;
  for (let offset = 0; offset < caminhos.length; offset += 100) {
    const lote = caminhos.slice(offset, offset + 100);
    const { data, error } = await admin.storage.from("anexos").remove(lote);
    if (error) {
      avisos.push("As atas foram excluídas, mas alguns arquivos físicos não puderam ser removidos do armazenamento: " + error.message);
      continue;
    }
    arquivosRemovidos += data?.length ?? lote.length;
  }

  return {
    atas_excluidas: ids.length,
    pedidos_excluidos: pedidos?.length ?? 0,
    anexos_excluidos: anexos?.length ?? 0,
    arquivos_removidos: arquivosRemovidos,
    avisos,
  };
}

async function criarBackupZip(admin: SupabaseClient) {
  const tabelas: Record<string, unknown[]> = {};
  for (const tabela of BACKUP_TABLES) {
    tabelas[tabela] = await selectAllRows(admin, tabela);
  }

  const usuariosAuth: Array<Record<string, unknown>> = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Falha ao exportar os cadastros de autenticação: " + error.message);
    usuariosAuth.push(...data.users.map((user) => ({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      user_metadata: user.user_metadata ?? {},
      app_metadata: user.app_metadata ?? {},
      // Senhas, hashes, tokens e fatores de autenticação nunca são exportados.
    })));
    if (data.users.length < 1000) break;
  }

  const arquivosZip: Record<string, Uint8Array> = {};
  const arquivosIncluidos: Array<{ caminho: string; tamanho_bytes: number; atualizado_em?: string | null }> = [];
  const limiteBytes = 180 * 1024 * 1024;
  let totalArquivosBytes = 0;
  const bucket = admin.storage.from("anexos");

  async function percorrerPasta(prefixo: string) {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(prefixo, { limit: 100, offset });
      if (error) throw new Error("Falha ao listar documentos do backup: " + error.message);
      for (const entrada of data ?? []) {
        const caminho = prefixo ? prefixo + "/" + entrada.name : entrada.name;
        if (entrada.id === null) {
          await percorrerPasta(caminho);
          continue;
        }
        const { data: arquivo, error: downloadError } = await bucket.download(caminho);
        if (downloadError || !arquivo) {
          throw new Error(`Falha ao baixar o anexo "${caminho}": ${downloadError?.message ?? "arquivo indisponível"}`);
        }
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        totalArquivosBytes += bytes.byteLength;
        if (totalArquivosBytes > limiteBytes) {
          throw new Error("O backup ultrapassou o limite seguro de 180 MB de anexos. Divida a exportação ou reduza o volume de arquivos.");
        }
        arquivosZip["anexos/" + caminho] = bytes;
        arquivosIncluidos.push({
          caminho,
          tamanho_bytes: bytes.byteLength,
          atualizado_em: entrada.updated_at ?? null,
        });
      }
      if (!data || data.length < 100) break;
    }
  }

  await percorrerPasta("");

  const metadata = {
    sistema: "Gestão em Saúde — Prefeitura Municipal de Cajati",
    gerado_em: new Date().toISOString(),
    tabelas_incluidas: BACKUP_TABLES,
    quantidade_registros: Object.fromEntries(Object.entries(tabelas).map(([nome, linhas]) => [nome, linhas.length])),
    quantidade_usuarios_autenticacao: usuariosAuth.length,
    quantidade_arquivos: arquivosIncluidos.length,
    tamanho_anexos_bytes: totalArquivosBytes,
    observacao: "Backup de dados e anexos. Por segurança, não inclui senhas, hashes de senha, tokens, fatores de autenticação, chaves ou configurações secretas do projeto. Os usuários podem precisar redefinir suas senhas em uma restauração.",
  };

  arquivosZip["backup.json"] = strToU8(JSON.stringify({ metadata, tabelas, usuarios_autenticacao: usuariosAuth, arquivos: arquivosIncluidos }, null, 2));
  arquivosZip["LEIA-ME.txt"] = strToU8(
    "BACKUP — GESTÃO EM SAÚDE / PREFEITURA DE CAJATI\n\n" +
    "O arquivo backup.json contém os registros das tabelas e os metadados dos arquivos.\n" +
    "A pasta anexos/ contém os documentos armazenados no bucket de anexos.\n\n" +
    "Por segurança, este pacote não contém senhas, hashes de senha, tokens, fatores de autenticação ou chaves secretas.\n" +
    "Guarde este arquivo em local protegido, pois ele contém dados pessoais e administrativos.\n",
  );
  const zip = zipSync(arquivosZip, { level: 6 });
  const dataNome = new Date().toISOString().slice(0, 10);
  return new Response(zip, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="backup-gestao-saude-${dataNome}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = (await req.json()) as Action;
    const { admin, auth, url, publicKey } = await createClients();

    if (body?.action === "login-cpf") {
      return await handleLoginCpf(body, admin, auth);
    }

    const { user: solicitante } = await requireAdmin(req, url, publicKey);

    if (body.action === "export-backup") {
      return await criarBackupZip(admin);
    }

    if (body.action === "list-atas-admin") {
      return json({ atas: await listarAtasAdministrativas(admin) });
    }

    if (body.action === "delete-atas-admin") {
      return json(await excluirAtasAdministrativamente(admin, body.ata_ids));
    }

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
      const adminIds = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
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
            admin: adminIds.has(u.id),
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
        const { data: adminRoles, error: countError } = await admin.from("user_roles").select("user_id").eq("role", "admin");
        if (countError) throw countError;
        const otherAdminIds = (adminRoles ?? []).map((r) => r.user_id).filter((id) => id !== userId);
        const { data: activeAdmins, error: activeError } = otherAdminIds.length
          ? await admin.from("user_profiles").select("user_id").in("user_id", otherAdminIds).eq("suspenso", false)
          : { data: [], error: null };
        if (activeError) throw activeError;
        if (!activeAdmins?.length) return json({ error: "O sistema precisa manter pelo menos um administrador ativo." }, 400);
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
    const status = /sessão ausente|sessão inválida/i.test(message) ? 401
      : /apenas administradores|acesso está suspenso/i.test(message) ? 403 : 400;
    return json({ error: message }, status);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
