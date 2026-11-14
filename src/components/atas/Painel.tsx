import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, FileText, LogOut, UserPlus, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { Contratos } from "./Contratos";
import { NovoUsuario } from "./NovoUsuario";
import { brl, dataBR, diasParaVencer, statusAta, type StatusAta } from "@/lib/vencimento";

type Ata = Tables<"atas">;
type Item = Tables<"ata_itens">;
type Classe = Tables<"classificacoes">;

const statusInfo: Record<StatusAta, { rotulo: string; cls: string }> = {
  vencida: { rotulo: "Vencida", cls: "bg-destructive text-destructive-foreground" },
  alerta: { rotulo: "Vence em breve", cls: "bg-warning text-warning-foreground" },
  vigente: { rotulo: "Vigente", cls: "bg-success text-success-foreground" },
};

export function StatusBadge({ ata }: { ata: { data_vencimento: string; dias_alerta: number } }) {
  const s = statusAta(ata.data_vencimento, ata.dias_alerta);
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo[s].cls}`}>{statusInfo[s].rotulo}</span>;
}

export function textoDias(d: number) {
  if (d < 0) return `venceu há ${-d} dia(s)`;
  if (d === 0) return "vence hoje";
  return `faltam ${d} dia(s)`;
}

export function Painel({ email, userId }: { email: string; userId: string }) {
  const qc = useQueryClient();
  const [novoUsuario, setNovoUsuario] = useState(false);
  const adminQ = useQuery({
    queryKey: ["admin", userId],
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      return !!data;
    },
  });
  const [aba, setAba] = useState<"atas" | "contratos">("atas");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Ata> | null>(null);
  const [gerirClasses, setGerirClasses] = useState(false);
  const [filtroClasse, setFiltroClasse] = useState<string>("todas");
  const [busca, setBusca] = useState("");

  const atasQ = useQuery({
    queryKey: ["atas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("atas").select("*").order("data_vencimento");
      if (error) throw error;
      return data;
    },
  });
  const classesQ = useQuery({
    queryKey: ["classificacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classificacoes").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
  const totaisQ = useQuery({
    queryKey: ["totais"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ata_itens").select("ata_id, preco_total");
      if (error) throw error;
      const m: Record<string, number> = {};
      data.forEach((i) => (m[i.ata_id] = (m[i.ata_id] ?? 0) + Number(i.preco_total ?? 0)));
      return m;
    },
  });

  const atas = atasQ.data ?? [];
  const classes = classesQ.data ?? [];
  const nomeClasse = (id: string | null) => classes.find((c) => c.id === id)?.nome;

  const filtradas = useMemo(
    () =>
      atas.filter(
        (a) =>
          (filtroClasse === "todas" || (filtroClasse === "sem" ? !a.classificacao_id : a.classificacao_id === filtroClasse)) &&
          `${a.numero} ${a.objeto} ${a.fornecedor ?? ""} ${a.processo ?? ""}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [atas, filtroClasse, busca],
  );
  const alertas = atas.filter((a) => statusAta(a.data_vencimento, a.dias_alerta) !== "vigente");

  const ataSel = atas.find((a) => a.id === selecionada);

  async function salvarAta() {
    if (!editando?.numero || !editando.objeto || !editando.data_vencimento) {
      toast.error("Preencha número, objeto e data de vencimento.");
      return;
    }
    const payload = {
      numero: editando.numero,
      processo: editando.processo || null,
      objeto: editando.objeto,
      fornecedor: editando.fornecedor || null,
      data_homologacao: editando.data_homologacao || null,
      data_vencimento: editando.data_vencimento,
      dias_alerta: Number(editando.dias_alerta ?? 90),
      observacoes: editando.observacoes || null,
      classificacao_id: editando.classificacao_id || null,
    };
    const { error } = editando.id
      ? await supabase.from("atas").update(payload).eq("id", editando.id)
      : await supabase.from("atas").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Ata salva.");
    setEditando(null);
    qc.invalidateQueries({ queryKey: ["atas"] });
  }

  async function excluirAta(id: string) {
    if (!confirm("Excluir esta ata e todos os seus itens?")) return;
    const { error } = await supabase.from("atas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setSelecionada(null);
    qc.invalidateQueries({ queryKey: ["atas"] });
    qc.invalidateQueries({ queryKey: ["totais"] });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <span className="font-display text-xl">Departamento de Gestão em Saúde</span>
            <nav className="ml-6 flex gap-1">
              {(["atas", "contratos"] as const).map((a) => (
                <Button key={a} size="sm" variant={aba === a ? "secondary" : "ghost"} onClick={() => { setAba(a); setSelecionada(null); }}>
                  {a === "atas" ? "Atas de Registro" : "Contratos"}
                </Button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {adminQ.data && (
              <Button variant="outline" size="sm" onClick={() => setNovoUsuario(true)}>
                <UserPlus className="h-4 w-4" /> Novo usuário
              </Button>
            )}
            <span className="hidden sm:inline">{email}{adminQ.data ? " · Administrador" : ""}</span>
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {aba === "contratos" ? (
          <Contratos classes={classes} onGerirClasses={() => setGerirClasses(true)} />
        ) : ataSel ? (
          <DetalheAta
            ata={ataSel}
            classe={nomeClasse(ataSel.classificacao_id)}
            onVoltar={() => setSelecionada(null)}
            onEditar={() => setEditando(ataSel)}
            onExcluir={() => excluirAta(ataSel.id)}
          />
        ) : (
          <>
            {alertas.length > 0 && (
              <section className="mb-8 rounded-xl border border-warning bg-warning/15 p-5">
                <div className="mb-3 flex items-center gap-2 font-medium text-warning-foreground">
                  <AlertTriangle className="h-5 w-5" />
                  {alertas.length} ata(s) exigem abertura de novo processo licitatório
                </div>
                <ul className="space-y-1.5 text-sm">
                  {alertas.map((a) => (
                    <li key={a.id}>
                      <button className="text-left hover:underline" onClick={() => setSelecionada(a.id)}>
                        <strong>Ata {a.numero}</strong> — {a.objeto} · vence em {dataBR(a.data_vencimento)} ({textoDias(diasParaVencer(a.data_vencimento))})
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl">Atas cadastradas</h2>
                <p className="text-sm text-muted-foreground">{atas.length} ata(s) no total</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setGerirClasses(true)}>
                  <Tags className="h-4 w-4" /> Classificações
                </Button>
                <Button onClick={() => setEditando({ dias_alerta: 90 })}>
                  <Plus className="h-4 w-4" /> Nova ata
                </Button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <Input placeholder="Buscar por número, objeto, fornecedor..." className="max-w-xs" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <select
                className="h-9 rounded-md border border-input bg-card px-3 text-sm"
                value={filtroClasse}
                onChange={(e) => setFiltroClasse(e.target.value)}
              >
                <option value="todas">Todas as classificações</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
                <option value="sem">Sem classificação</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nº Ata</th>
                    <th className="px-4 py-3 font-medium">Objeto</th>
                    <th className="px-4 py-3 font-medium">Classificação</th>
                    <th className="px-4 py-3 font-medium">Fornecedor</th>
                    <th className="px-4 py-3 font-medium">Vencimento</th>
                    <th className="px-4 py-3 text-right font-medium">Valor total</th>
                    <th className="px-4 py-3 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((a) => (
                    <tr key={a.id} className="cursor-pointer border-t hover:bg-accent/50" onClick={() => setSelecionada(a.id)}>
                      <td className="px-4 py-3 font-medium">{a.numero}</td>
                      <td className="px-4 py-3">{a.objeto}</td>
                      <td className="px-4 py-3 text-muted-foreground">{nomeClasse(a.classificacao_id) ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.fornecedor ?? "—"}</td>
                      <td className="px-4 py-3">
                        {dataBR(a.data_vencimento)}
                        <div className="text-xs text-muted-foreground">{textoDias(diasParaVencer(a.data_vencimento))}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{brl(totaisQ.data?.[a.id] ?? 0)}</td>
                      <td className="px-4 py-3"><StatusBadge ata={a} /></td>
                    </tr>
                  ))}
                  {filtradas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        {atasQ.isLoading ? "Carregando..." : "Nenhuma ata encontrada. Clique em “Nova ata” para começar."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar ata" : "Nova ata"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nº da ata *"><Input value={editando.numero ?? ""} onChange={(e) => setEditando({ ...editando, numero: e.target.value })} /></Campo>
              <Campo label="Nº do processo"><Input value={editando.processo ?? ""} onChange={(e) => setEditando({ ...editando, processo: e.target.value })} /></Campo>
              <Campo label="Objeto *" full><Input value={editando.objeto ?? ""} onChange={(e) => setEditando({ ...editando, objeto: e.target.value })} /></Campo>
              <Campo label="Classificação">
                <select
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={editando.classificacao_id ?? ""}
                  onChange={(e) => setEditando({ ...editando, classificacao_id: e.target.value || null })}
                >
                  <option value="">Sem classificação</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Fornecedor"><Input value={editando.fornecedor ?? ""} onChange={(e) => setEditando({ ...editando, fornecedor: e.target.value })} /></Campo>
              <Campo label="Data de homologação"><Input type="date" value={editando.data_homologacao ?? ""} onChange={(e) => setEditando({ ...editando, data_homologacao: e.target.value })} /></Campo>
              <Campo label="Data de vencimento *"><Input type="date" value={editando.data_vencimento ?? ""} onChange={(e) => setEditando({ ...editando, data_vencimento: e.target.value })} /></Campo>
              <Campo label="Alertar com quantos dias de antecedência?" full>
                <Input type="number" min={1} value={editando.dias_alerta ?? 90} onChange={(e) => setEditando({ ...editando, dias_alerta: Number(e.target.value) })} />
              </Campo>
              <Campo label="Observações" full><Textarea value={editando.observacoes ?? ""} onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })} /></Campo>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarAta}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NovoUsuario aberto={novoUsuario} onFechar={() => setNovoUsuario(false)} />
      <GerirClasses aberto={gerirClasses} onFechar={() => setGerirClasses(false)} classes={classes} />
    </div>
  );
}

export function Campo({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${full ? "col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function GerirClasses({ aberto, onFechar, classes }: { aberto: boolean; onFechar: () => void; classes: Classe[] }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    const { error } = await supabase.from("classificacoes").insert({ nome: nome.trim() });
    if (error) { toast.error(error.code === "23505" ? "Essa classificação já existe." : error.message); return; }
    setNome("");
    qc.invalidateQueries({ queryKey: ["classificacoes"] });
  }
  async function remover(id: string) {
    if (!confirm("Remover esta classificação? As atas ficarão sem classificação.")) return;
    await supabase.from("classificacoes").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["classificacoes"] });
    qc.invalidateQueries({ queryKey: ["atas"] });
  }
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Classificações</DialogTitle></DialogHeader>
        <form onSubmit={adicionar} className="flex gap-2">
          <Input placeholder="Ex.: Medicamentos, Enfermagem..." value={nome} onChange={(e) => setNome(e.target.value)} />
          <Button type="submit"><Plus className="h-4 w-4" /> Adicionar</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {classes.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground">
              {c.nome}
              <button aria-label={`Remover ${c.nome}`} onClick={() => remover(c.id)} className="opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
          {classes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma classificação criada ainda.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetalheAta({ ata, classe, onVoltar, onEditar, onExcluir }: { ata: Ata; classe?: string | undefined; onVoltar: () => void; onEditar: () => void; onExcluir: () => void }) {
  const qc = useQueryClient();
  const itensQ = useQuery({
    queryKey: ["itens", ata.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ata_itens").select("*").eq("ata_id", ata.id).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const itens = itensQ.data ?? [];
  const total = itens.reduce((s, i) => s + Number(i.preco_total ?? 0), 0);
  const [novo, setNovo] = useState({ descricao: "", unidade: "UN", quantidade: "1", preco_unitario: "" });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["itens", ata.id] });
    qc.invalidateQueries({ queryKey: ["totais"] });
  };

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.descricao || !novo.preco_unitario) { toast.error("Informe descrição e preço unitário."); return; }
    const { error } = await supabase.from("ata_itens").insert({
      ata_id: ata.id,
      descricao: novo.descricao,
      unidade: novo.unidade || "UN",
      quantidade: Number(novo.quantidade.replace(",", ".")),
      preco_unitario: Number(novo.preco_unitario.replace(",", ".")),
    });
    if (error) { toast.error(error.message); return; }
    setNovo({ descricao: "", unidade: "UN", quantidade: "1", preco_unitario: "" });
    recarregar();
  }
  async function removerItem(i: Item) {
    await supabase.from("ata_itens").delete().eq("id", i.id);
    recarregar();
  }

  const dias = diasParaVencer(ata.data_vencimento);
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onVoltar} className="mb-4"><ArrowLeft className="h-4 w-4" /> Voltar</Button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2"><StatusBadge ata={ata} />{classe && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">{classe}</span>}</div>
          <h2 className="font-display text-3xl">Ata {ata.numero}</h2>
          <p className="text-muted-foreground">{ata.objeto}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEditar}><Pencil className="h-4 w-4" /> Editar</Button>
          <Button variant="outline" onClick={onExcluir}><Trash2 className="h-4 w-4" /> Excluir</Button>
        </div>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-4">
        <Info rotulo="Processo" valor={ata.processo ?? "—"} />
        <Info rotulo="Fornecedor" valor={ata.fornecedor ?? "—"} />
        <Info rotulo="Homologação" valor={dataBR(ata.data_homologacao)} />
        <Info rotulo="Vencimento" valor={`${dataBR(ata.data_vencimento)} · ${textoDias(dias)}`} />
      </div>

      <h3 className="mb-3 text-lg font-semibold">Itens da ata</h3>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Descrição</th>
              <th className="px-4 py-3 font-medium">Unid.</th>
              <th className="px-4 py-3 text-right font-medium">Qtd.</th>
              <th className="px-4 py-3 text-right font-medium">Preço unitário</th>
              <th className="px-4 py-3 text-right font-medium">Preço total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((i, idx) => (
              <tr key={i.id} className="border-t">
                <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-2.5">{i.descricao}</td>
                <td className="px-4 py-2.5">{i.unidade}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{Number(i.quantidade).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{brl(Number(i.preco_unitario))}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{brl(Number(i.preco_total))}</td>
                <td className="px-2"><Button variant="ghost" size="icon" aria-label="Remover item" onClick={() => removerItem(i)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            <tr className="border-t bg-muted/50">
              <td colSpan={5} className="px-4 py-3 text-right font-semibold">Valor total da ata</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{brl(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <form onSubmit={addItem} className="grid gap-2 border-t p-4 sm:grid-cols-[1fr_80px_100px_140px_auto]">
          <Input placeholder="Descrição do item" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          <Input placeholder="Unid." value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value })} />
          <Input placeholder="Qtd." inputMode="decimal" value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} />
          <Input placeholder="Preço unit. (R$)" inputMode="decimal" value={novo.preco_unitario} onChange={(e) => setNovo({ ...novo, preco_unitario: e.target.value })} />
          <Button type="submit"><Plus className="h-4 w-4" /> Item</Button>
        </form>
      </div>
      {ata.observacoes && <p className="mt-6 whitespace-pre-wrap text-sm text-muted-foreground">{ata.observacoes}</p>}
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className="mt-1 font-medium">{valor}</div>
    </div>
  );
}
