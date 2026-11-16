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
import { Search, ShieldCheck, UserRound, Users, KeyRound, Ban, CheckCircle2, RefreshCw } from "lucide-react";
import { ImportacaoLoteAtas } from "@/components/atas/ImportacaoLoteAtas";

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

function mascararCpf(cpf: string | null) {
  if (!cpf) return "Pendente";
  return "***.***.***-" + cpf.slice(-2);
}

export function Administracao() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<EdicaoUsuario | null>(null);
  const [salvando, setSalvando] = useState(false);

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
  const filtrados = useMemo(() => {
    const termo = busca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!termo) return usuarios;
    return usuarios.filter((usuario) =>
      (usuario.nome + " " + usuario.email + " " + (usuario.cpf ?? "") + " " + usuario.setor_nome)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(termo),
    );
  }, [usuarios, busca]);

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

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="app-eyebrow">ACESSO RESTRITO</div>
          <h2 className="app-page-title flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> Administração de usuários</h2>
          <p className="text-sm text-muted-foreground">Gerencie contas, setores, permissões, suspensão e senhas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportacaoLoteAtas />
          <Button variant="outline" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
            <RefreshCw className="h-4 w-4" /> Atualizar lista
          </Button>
        </div>
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

      {consulta.isLoading ? (
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Carregando usuários...</div>
      ) : consulta.isError ? (
        <div className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive">Não foi possível carregar os usuários. {consulta.error instanceof Error ? consulta.error.message : ""}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3">Usuário</th><th className="p-3">CPF</th><th className="p-3">Setor</th><th className="p-3">Perfil</th><th className="p-3">Acesso</th><th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((usuario) => (
                <tr key={usuario.id} className="border-t">
                  <td className="p-3">
                    <div className="flex items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="font-medium">{usuario.nome || "Nome não informado"}</div><div className="max-w-[260px] truncate text-xs text-muted-foreground">{usuario.email}</div></div></div>
                  </td>
                  <td className="p-3 tabular-nums">{mascararCpf(usuario.cpf)}</td>
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
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Usuários lotados em Gestão podem consultar dados de todos os setores. Isso não concede, por si só, privilégios de administrador.
              </p>
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
    </section>
  );
}
