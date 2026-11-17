import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search, ShieldCheck, UserRound, Users, KeyRound, Ban, CheckCircle2, RefreshCw,
  Database, Download, FileArchive, Trash2, AlertTriangle, UsersRound, FileUp,
} from "lucide-react";
import { ImportacaoLoteAtas } from "@/components/atas/ImportacaoLoteAtas";
import { VERSAO_SISTEMA } from "@/lib/release-notes";

type Usuario = {
  id: string;
  email: string;
  nome: string;
  cpf: string | null;
  setor_id: string;
  setor_nome: string;
  suspenso: boolean;
  admin: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
};
type EdicaoUsuario = {
  id: string;
  email: string;
  nome: string;
  setor_id: string;
  admin: boolean;
  suspenso: boolean;
  nova_senha: string;
};
type AtaAdmin = {
  id: string;
  numero: string | null;
  objeto: string;
  data_vencimento: string;
  situacao_cadastro: string;
  setor_id: string;
  created_at: string;
  pedidos_vinculados: number;
};
type AbaAdmin = "usuarios" | "backup" | "atas";

function formatarCpf(cpf: string | null) {
  if (!cpf) return "Pendente";
  const numeros = cpf.replace(/\D/g, "");
  if (numeros.length !== 11) return cpf;
  return numeros.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

function dataBR(valor: string) {
  return valor ? new Date(valor + "T12:00:00").toLocaleDateString("pt-BR") : "—";
}

export function Administracao() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<AbaAdmin>("usuarios");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<EdicaoUsuario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [exportandoBackup, setExportandoBackup] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [dialogExclusaoAtas, setDialogExclusaoAtas] = useState(false);
  const [senhaExclusaoAtas, setSenhaExclusaoAtas] = useState("");
  const [excluindoAtas, setExcluindoAtas] = useState(false);

  const consulta = useQuery({
    queryKey: ["administracao-usuarios"],
    queryFn: () => adminApi<{ usuarios: Usuario[]; setores: Array<{ id: string; nome: string; ativo: boolean }> }>({ action: "list-users" }),
  });
  const usuarios = (consulta.data?.usuarios ?? []) as Usuario[];
  const setoresQ = useQuery({
    queryKey: ["setores-administracao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setores")
        .select("*")
        .eq("ativo", true)
        .order("acesso_global", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data;
    },
  });
  const setores = setoresQ.data ?? [];

  const atasQ = useQuery({
    queryKey: ["administracao-atas"],
    queryFn: () => adminApi<{ atas: AtaAdmin[] }>({ action: "list-atas-admin" }),
    enabled: aba === "atas",
  });
  const atas = atasQ.data?.atas ?? [];

  const termo = busca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const filtrados = useMemo(() => {
    if (!termo) return usuarios;
    return usuarios.filter((usuario) =>
      (usuario.nome + " " + usuario.email + " " + (usuario.cpf ?? "") + " " + usuario.setor_nome)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(termo),
    );
  }, [usuarios, termo]);

  const atasFiltradas = useMemo(() => {
    if (!termo) return atas;
    return atas.filter((ata) =>
      (ata.numero ?? "") + " " + ata.objeto + " " + ata.situacao_cadastro,
    .normalize?.("NFD")?.replace?.(/[\u0300-\u036f]/g, "")?.toLowerCase?.().includes(termo) ?? false);
  }, [atas, termo]);

  const pedidosSelecionados = atas
    .filter((ata) => selecionadas.includes(ata.id))
    .reduce((total, ata) => total + Number(ata.pedidos_vinculados ?? 0), 0);
  const todasVisiveisSelecionadas = atasFiltradas.length > 0 && atasFiltradas.every((ata) => selecionadas.includes(ata.id));

  function abrirEdicao(usuario: Usuario) {
    setEditando({
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      setor_id: usuario.setor_id,
      admin: usuario.admin,
      suspenso: usuario.suspenso,
      nova_senha: "",
    });
  }

  async function aplicarAlteracoes() {
    if (!editando) return;
    setSalvando(true);
    try {
      await adminApi({
        action: "update-user",
        user_id: editando.id,
        email: editando.email,
        nome: editando.nome,
        setor_id: editando.setor_id,
        admin: editando.admin,
        suspenso: editando.suspenso,
        ...(editando.nova_senha ? { nova_senha: editando.nova_senha } : {}),
      });
      toast.success("Usuário atualizado.");
      setEditando(null);
      await qc.invalidateQueries({ queryKey: ["administracao-usuarios"] });
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível atualizar o usuário.");
    } finally {
      setSalvando(false);
    }
  }

  async function exportarBackup() {
    if (exportandoBackup) return;
    setExportandoBackup(true);
    try {
      const [{ data: sessao, error: erroSessao }] = await Promise.all([supabase.auth.getSession()]);
      if (erroSessao || !sessao.session?.access_token) {
        throw new Error("Sua sessão expirou. Entre novamente no sistema.");
      }
      const url = import.meta.env["VITE_SUPABASE_URL"]?.replace(/\/+$/, "");
      const chavePublica = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !chavePublica) throw new Error("Não foi possível localizar a configuração pública do Supabase.");

      const response = await fetch(url + "/functions/v1/admin-users", {
        method: "POST",
        headers: {
          apikey: chavePublica,
          Authorization: "Bearer " + sessao.session.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "export-backup" }),
      });
      if (!response.ok) {
        const detalhe = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(detalhe?.error ?? "O backend não conseguiu gerar o arquivo de backup.");
      }
      const arquivo = await response.blob();
      if (!arquivo.size) throw new Error("O arquivo de backup retornou vazio.");
      const nome = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]
        ?? `backup-gestao-saude-${new Date().toISOString().slice(0, 10)}.zip`;
      const objetoUrl = URL.createObjectURL(arquivo);
      const link = document.createElement("a");
      link.href = objetoUrl;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objetoUrl);
      toast.success("Backup gerado e baixado com sucesso.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível gerar o backup.");
    } finally {
      setExportandoBackup(false);
    }
  }

  function alternarAta(id: string) {
    setSelecionadas((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]);
  }

  function abrirExclusao(ids: string[]) {
    if (!ids.length) {
      toast.error("Selecione pelo menos uma ata.");
      return;
    }
    if (ids.length > 100) {
      toast.error("A exclusão em lote permite até 100 atas por operação.");
      return;
    }
    setSelecionadas(ids);
    setSenhaExclusaoAtas("");
    setDialogExclusaoAtas(true);
  }

  async function confirmarExclusaoAtas() {
    if (!selecionadas.length || excluindoAtas) return;
    if (!senhaExclusaoAtas) {
      toast.error("Informe sua senha para confirmar a exclusão.");
      return;
    }
    setExcluindoAtas(true);
    try {
      const { data: usuarioAtual, error: erroUsuario } = await supabase.auth.getUser();
      if (erroUsuario || !usuarioAtual.user?.email) {
        throw new Error("Não foi possível validar sua sessão. Entre novamente no sistema.");
      }
      const { error: erroSenha } = await supabase.auth.signInWithPassword({
        email: usuarioAtual.user.email,
        password: senhaExclusaoAtas,
      });
      if (erroSenha) throw new Error("Senha incorreta. Nenhuma ata foi excluída.");

      const resultado = await adminApi<{
        atas_excluidas: number;
        pedidos_excluidos: number;
        anexos_excluidos: number;
        arquivos_removidos: number;
        avisos?: string[];
      }>({ action: "delete-atas-admin", ata_ids: selecionadas });

      toast.success(
        `${resultado.atas_excluidas} ata(s) e ${resultado.pedidos_excluidos} pedido(s) vinculado(s) excluídos.`,
      );
      for (const aviso of resultado.avisos ?? []) toast.warning(aviso);
      setDialogExclusaoAtas(false);
      setSelecionadas([]);
      setSenhaExclusaoAtas("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["administracao-atas"] }),
        qc.invalidateQueries({ queryKey: ["atas"] }),
        qc.invalidateQueries({ queryKey: ["pedidos"] }),
        qc.invalidateQueries({ queryKey: ["totais"] }),
      ]);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível excluir as atas.");
    } finally {
      setExcluindoAtas(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="app-eyebrow">ACESSO RESTRITO</div>
          <h2 className="app-page-title flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> Painel do administrador</h2>
          <p className="text-sm text-muted-foreground">Gestão de usuários, cópias de segurança e Atas de Registro de Preços.</p>
        </div>
        <Badge variant="outline" className="px-3 py-1.5 text-sm">Versão {VERSAO_SISTEMA}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant={aba === "usuarios" ? "default" : "outline"} className="h-auto justify-start gap-3 p-4" onClick={() => setAba("usuarios")}>
          <Users className="h-5 w-5" /><span className="text-left"><span className="block font-semibold">Gestão de usuários</span><span className="block text-xs font-normal opacity-75">Contas, CPF, setor e permissões</span></span>
        </Button>
        <Button variant={aba === "backup" ? "default" : "outline"} className="h-auto justify-start gap-3 p-4" onClick={() => setAba("backup")}>
          <Database className="h-5 w-5" /><span className="text-left"><span className="block font-semibold">Backup do sistema</span><span className="block text-xs font-normal opacity-75">Exportar dados e documentos</span></span>
        </Button>
        <Button variant={aba === "atas" ? "default" : "outline"} className="h-auto justify-start gap-3 p-4" onClick={() => setAba("atas")}>
          <FileArchive className="h-5 w-5" /><span className="text-left"><span className="block font-semibold">Gestão de atas</span><span className="block text-xs font-normal opacity-75">Importação em massa e exclusão</span></span>
        </Button>
      </div>

      {aba === "usuarios" && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Gestão de usuários</h3>
              <p className="text-sm text-muted-foreground">Gerencie contas, CPFs, setores, permissões, suspensão e senhas.</p>
            </div>
            <Button variant="outline" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
              <RefreshCw className="h-4 w-4" /> Atualizar lista
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> Total de usuários</div><div className="mt-2 text-2xl font-semibold">{usuarios.length}</div></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Ativos</div><div className="mt-2 text-2xl font-semibold">{usuarios.filter((u) => !u.suspenso).length}</div></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Ban className="h-4 w-4" /> Suspensos</div><div className="mt-2 text-2xl font-semibold">{usuarios.filter((u) => u.suspenso).length}</div></div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por nome, e-mail, CPF ou setor..." className="pl-9" />
            </div>
            <span className="text-xs text-muted-foreground">{filtrados.length} de {usuarios.length} usuário(s)</span>
          </div>

          <p className="text-xs text-muted-foreground">Os CPFs completos são exibidos exclusivamente neste painel, acessível a administradores.</p>
          {consulta.isLoading ? (
            <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Carregando usuários...</div>
          ) : consulta.isError ? (
            <div className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive">Não foi possível carregar os usuários. {consulta.error instanceof Error ? consulta.error.message : ""}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted text-left">
                  <tr><th className="p-3">Usuário</th><th className="p-3">CPF</th><th className="p-3">Setor</th><th className="p-3">Perfil</th><th className="p-3">Acesso</th><th className="p-3 text-right">Ação</th></tr>
                </thead>
                <tbody>
                  {filtrados.map((usuario) => (
                    <tr key={usuario.id} className="border-t">
                      <td className="p-3">
                        <div className="flex items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="font-medium">{usuario.nome || "Nome não informado"}</div><div className="max-w-[260px] truncate text-xs text-muted-foreground">{usuario.email}</div></div></div>
                      </td>
                      <td className="p-3 tabular-nums whitespace-nowrap">{formatarCpf(usuario.cpf)}</td>
                      <td className="p-3">{usuario.setor_nome}</td>
                      <td className="p-3">{usuario.admin ? <Badge>Administrador</Badge> : <Badge variant="secondary">Usuário</Badge>}</td>
                      <td className="p-3">{usuario.suspenso ? <Badge variant="destructive">Suspenso</Badge> : <Badge variant="outline">Ativo</Badge>}</td>
                      <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => abrirEdicao(usuario)}>Editar</Button></td>
                    </tr>
                  ))}
                  {filtrados.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {aba === "backup" && (
        <div className="rounded-2xl border bg-card p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><Database className="h-6 w-6" /></div>
            <div><h3 className="text-lg font-semibold">Cópia de segurança do sistema</h3><p className="text-sm text-muted-foreground">Exportação dos registros e documentos em um único arquivo ZIP.</p></div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="font-medium">O arquivo incluirá</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Atas, itens, contratos e classificações.</li>
                <li>Pedidos e respectivos dados registrados.</li>
                <li>Usuários, CPFs, setores, perfis e permissões.</li>
                <li>Feedbacks e documentos anexados ao bucket do sistema.</li>
              </ul>
            </div>
            <p className="text-muted-foreground">Por segurança, o backup não inclui senhas, hashes de senha, tokens de sessão, fatores de autenticação nem chaves secretas do projeto.</p>
            <Button onClick={() => void exportarBackup()} disabled={exportandoBackup}>
              {exportandoBackup ? <><RefreshCw className="h-4 w-4 animate-spin" /> Preparando backup...</> : <><Download className="h-4 w-4" /> Criar backup e baixar arquivo ZIP</>}
            </Button>
          </div>
        </div>
      )}

      {aba === "atas" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 className="text-lg font-semibold">Gestão de Atas de Registro de Preços</h3><p className="text-sm text-muted-foreground">Consulte, importe em lote e exclua atas e seus registros vinculados.</p></div>
            <div className="flex flex-wrap gap-2">
              <ImportacaoLoteAtas />
              <Button variant="outline" onClick={() => void atasQ.refetch()} disabled={atasQ.isFetching}><RefreshCw className="h-4 w-4" /> Atualizar lista</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por número, objeto ou situação..." className="pl-9" />
            </div>
            <span className="text-xs text-muted-foreground">{atasFiltradas.length} de {atas.length} ata(s)</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={todasVisiveisSelecionadas} onChange={(e) => setSelecionadas(e.target.checked ? [...new Set([...selecionadas, ...atasFiltradas.map((ata) => ata.id)])] : selecionadas.filter((id) => !atasFiltradas.some((ata) => ata.id === id)))} />
              Selecionar todas as atas exibidas
            </label>
            <Button variant="destructive" size="sm" disabled={!selecionadas.length || selecionadas.length > 100} onClick={() => abrirExclusao(selecionadas)}>
              <Trash2 className="h-4 w-4" /> Excluir selecionadas ({selecionadas.length})
            </Button>
          </div>
          {selecionadas.length > 100 && <p className="text-xs text-destructive">Selecione no máximo 100 atas por operação.</p>}
          {atasQ.isLoading ? (
            <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Carregando atas...</div>
          ) : atasQ.isError ? (
            <div className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive">Não foi possível carregar as atas. {atasQ.error instanceof Error ? atasQ.error.message : ""}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted text-left">
                  <tr><th className="w-10 p-3"> </th><th className="p-3">Nº da ata</th><th className="p-3">Objeto</th><th className="p-3">Cadastro</th><th className="p-3">Vencimento</th><th className="p-3 text-center">Pedidos vinculados</th><th className="p-3 text-right">Ação</th></tr>
                </thead>
                <tbody>
                  {atasFiltradas.map((ata) => (
                    <tr key={ata.id} className="border-t">
                      <td className="p-3"><input type="checkbox" checked={selecionadas.includes(ata.id)} onChange={() => alternarAta(ata.id)} aria-label={`Selecionar ata ${ata.numero ?? "sem número"}`} /></td>
                      <td className="p-3 font-medium whitespace-nowrap">{ata.numero ?? "Em andamento"}</td>
                      <td className="p-3"><div className="max-w-[440px] truncate" title={ata.objeto}>{ata.objeto}</div></td>
                      <td className="p-3"><Badge variant="secondary">{ata.situacao_cadastro}</Badge></td>
                      <td className="p-3 whitespace-nowrap">{dataBR(ata.data_vencimento)}</td>
                      <td className="p-3 text-center tabular-nums">{ata.pedidos_vinculados}</td>
                      <td className="p-3 text-right"><Button size="sm" variant="destructive" onClick={() => abrirExclusao([ata.id])}><Trash2 className="h-4 w-4" /> Excluir</Button></td>
                    </tr>
                  ))}
                  {atasFiltradas.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhuma ata encontrada.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
          {editando && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>E-mail de acesso</Label><Input type="email" value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Setor de lotação *</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={editando.setor_id} onChange={(e) => setEditando({ ...editando, setor_id: e.target.value })}>
                  <option value="">Selecione...</option>
                  {setores.map((setor) => <option key={setor.id} value={setor.id}>{setor.acesso_global ? setor.nome + " — Acesso geral" : "↳ " + setor.nome}</option>)}
                </select>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">Usuários lotados em Gestão podem consultar dados de todos os setores. Isso não concede, por si só, privilégios de administrador.</p>
              <div className="space-y-1.5 sm:col-span-2"><Label>Nova senha (opcional, mínimo 8 caracteres)</Label><Input type="password" autoComplete="new-password" value={editando.nova_senha} onChange={(e) => setEditando({ ...editando, nova_senha: e.target.value })} placeholder="Deixe em branco para manter a senha atual" /><p className="text-xs text-muted-foreground"><KeyRound className="mr-1 inline h-3 w-3" /> A senha será alterada imediatamente.</p></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editando.admin} onChange={(e) => setEditando({ ...editando, admin: e.target.checked })} /> Administrador do sistema</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editando.suspenso} onChange={(e) => setEditando({ ...editando, suspenso: e.target.checked })} /> Suspender acesso</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={() => void aplicarAlteracoes()} disabled={!editando?.setor_id || salvando}>{salvando ? "Salvando..." : "Salvar alterações"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogExclusaoAtas} onOpenChange={(open) => {
        if (!open && !excluindoAtas) {
          setDialogExclusaoAtas(false);
          setSenhaExclusaoAtas("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Confirmar exclusão de atas</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <p>Você está prestes a excluir permanentemente <strong>{selecionadas.length} ata(s)</strong>.</p>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="font-medium text-destructive">Esta operação também apagará {pedidosSelecionados} pedido(s) vinculados, os itens das atas e os registros de anexos. A ação não poderá ser desfeita.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha-exclusao-atas-admin">Digite sua senha para confirmar</Label>
              <Input id="senha-exclusao-atas-admin" type="password" autoComplete="current-password" value={senhaExclusaoAtas} onChange={(e) => setSenhaExclusaoAtas(e.target.value)} placeholder="Sua senha de acesso" disabled={excluindoAtas} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={excluindoAtas} onClick={() => { setDialogExclusaoAtas(false); setSenhaExclusaoAtas(""); }}>Cancelar</Button>
            <Button variant="destructive" disabled={excluindoAtas || !senhaExclusaoAtas} onClick={() => void confirmarExclusaoAtas()}>
              <Trash2 className="h-4 w-4" /> {excluindoAtas ? "Validando e excluindo..." : "Confirmar exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
