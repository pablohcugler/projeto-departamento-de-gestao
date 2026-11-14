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
import { Anexos } from "./Anexos";
import { brasaoMunicipio } from "@/lib/brasao";
import { AlertTriangle, ArrowLeft, FileText, LogOut, UserPlus, FileUp, Pencil, Plus, Tags, Trash2, X, CircleUserRound, MessageSquareText, ClipboardList } from "lucide-react";
import { Contratos } from "./Contratos";
import { NovoUsuario } from "./NovoUsuario";
import { ImportarItens } from "./ImportarItens";
import { TemaToggle } from "./TemaToggle";
import { ConfigTv } from "@/components/tv/ConfigTv";
import { brl, dataBR, diasParaVencer, statusAta, type StatusAta } from "@/lib/vencimento";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EnviarFeedback, RelatorioFeedbacks } from "./Feedbacks";

type Ata = Tables<"atas">;
type Item = Tables<"ata_itens">;
type Classe = Tables<"classificacoes">;

const FASES = ["Não iniciado", "Cotação", "Estudo Técnico Preliminar", "Termo de Referência", "Edital / Licitação", "Concluído"];

const statusInfo: Record<StatusAta, { rotulo: string; cls: string }> = {
  vencida: { rotulo: "Vencida", cls: "bg-destructive text-destructive-foreground" },
  alerta: { rotulo: "Vence em breve", cls: "bg-warning text-warning-foreground" },
  vigente: { rotulo: "Vigente", cls: "bg-success text-success-foreground" },
};

export function StatusBadge({ ata }: { ata: { data_vencimento: string; dias_alerta: number } }) {
  const s = statusAta(ata.data_vencimento, ata.dias_alerta);
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo[s].cls}`}>{statusInfo[s].rotulo}</span>;
}

function fornecedoresDe(a: { fornecedor: string | null }, dosItens: string[] = []) {
  const todos = [...(a.fornecedor ? a.fornecedor.split(",").map((x) => x.trim()).filter(Boolean) : []), ...dosItens];
  return [...new Set(todos)].join(", ");
}

export function textoDias(d: number) {
  if (d < 0) return `venceu há ${-d} dia(s)`;
  if (d === 0) return "vence hoje";
  return `faltam ${d} dia(s)`;
}

export function Painel({ nome, userId }: { nome?: string | null; userId: string }) {
  const qc = useQueryClient();
  const [novoUsuario, setNovoUsuario] = useState(false);\n  const [feedbackAberto, setFeedbackAberto] = useState(false);
  const adminQ = useQuery({
    queryKey: ["admin", userId],
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      return !!data;
    },
  });
  const [aba, setAba] = useState<"atas" | "contratos" | "feedbacks">("atas");
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
      const { data, error } = await supabase.from("ata_itens").select("ata_id, preco_total, fornecedor");
      if (error) throw error;
      const m: Record<string, number> = {};
      const f: Record<string, string[]> = {};
      data.forEach((i) => {
        m[i.ata_id] = (m[i.ata_id] ?? 0) + Number(i.preco_total ?? 0);
        if (i.fornecedor && !(f[i.ata_id] ??= []).includes(i.fornecedor)) f[i.ata_id]!.push(i.fornecedor);
      });
      return { m, f };
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
          `${a.numero} ${a.objeto} ${fornecedoresDe(a, totaisQ.data?.f?.[a.id])} ${a.processo ?? ""}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [atas, filtroClasse, busca, totaisQ.data],
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
      pregao: editando.pregao || null,
      memorando_1doc: editando.memorando_1doc || null,
      processo_1doc: editando.processo_1doc || null,
      fase_processo: editando.fase_processo || null,
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
    <div className="min-h-screen bg-background app-shell">
      <header className="app-header sticky top-0 z-30">
        <div className="app-header-inner mx-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-3 sm:px-6 sm:py-4">
          <div className="app-brand flex min-w-0 flex-wrap items-center gap-3">
            <div className="app-crest"><img src={brasaoMunicipio} alt="Brasão do município" className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" /></div>
            <div className="leading-tight"><span className="block font-semibold tracking-tight text-base sm:text-lg">Gestão em Saúde</span><span className="block text-[10px] uppercase tracking-[0.17em] opacity-70">Prefeitura de Cajati</span></div>
            <nav className="app-nav flex gap-1 sm:ml-6">
              {(["atas", "contratos"] as const).map((a) => (
                <Button key={a} size="sm" variant={aba === a ? "secondary" : "ghost"} className={aba === a ? "app-nav-active" : "app-nav-item"} onClick={() => { setAba(a); setSelecionada(null); }}>
                  {a === "atas" ? "Atas de Registro" : "Contratos"}
                </Button>
              ))}
            </nav>
          </div>
          <div className="app-header-actions flex items-center gap-2 text-sm">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 rounded-full border border-white/15 px-2.5 text-white hover:bg-white/10" aria-label="Abrir menu do usuário">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15"><CircleUserRound className="h-5 w-5" /></span>
                  <span className="hidden max-w-[150px] truncate sm:inline">{nome?.trim().split(/\s+/)[0] || "Minha conta"}</span>
                  <span className="text-xs opacity-70">⌄</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="max-w-[220px] truncate">{nome || "Conta do usuário"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ConfigTv menuTrigger />
                <DropdownMenuItem onSelect={() => setFeedbackAberto(true)}><MessageSquareText className="h-4 w-4" /> Enviar feedback</DropdownMenuItem>
                {adminQ.data && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setNovoUsuario(true)}><UserPlus className="h-4 w-4" /> Novo usuário</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAba("feedbacks")}><ClipboardList className="h-4 w-4" /> Relatório de feedbacks</DropdownMenuItem>
                </>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => supabase.auth.signOut()} className="text-destructive focus:text-destructive"><LogOut className="h-4 w-4" /> Sair do sistema</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TemaToggle />
          </div>
        </div>
      </header>

      <main className="app-main mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-9">
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
                <div className="app-eyebrow">CONTROLE DE REGISTROS</div>
                <h2 className="app-page-title">Atas de Registro de Preços</h2>
                <p className="text-sm text-muted-foreground">{atas.length} ata(s) cadastrada(s) no sistema</p>
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

            <div className="app-toolbar mb-4 flex flex-wrap gap-2">
              <Input placeholder="Buscar por número, objeto, fornecedor..." className="w-full sm:max-w-xs" value={busca} onChange={(e) => setBusca(e.target.value)} />
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

            <div className="app-table-wrap overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nº Ata</th>
                    <th className="px-4 py-3 font-medium">Objeto</th>
                    <th className="px-4 py-3 font-medium">Classificação</th>
                    <th className="px-4 py-3 font-medium">Fornecedores</th>
                    <th className="px-4 py-3 font-medium">Vencimento</th>
                    <th className="px-4 py-3 text-right font-medium">Valor total</th>
                    <th className="px-4 py-3 font-medium">Situação</th>
                    <th className="px-4 py-3 font-medium">Fase do processo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((a) => (
                    <tr key={a.id} className="cursor-pointer border-t hover:bg-accent/50" onClick={() => setSelecionada(a.id)}>
                      <td className="px-4 py-3 font-medium">{a.numero}</td>
                      <td className="px-4 py-3">{a.objeto}</td>
                      <td className="px-4 py-3 text-muted-foreground">{nomeClasse(a.classificacao_id) ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fornecedoresDe(a, totaisQ.data?.f?.[a.id]) || "—"}</td>
                      <td className="px-4 py-3">
                        {dataBR(a.data_vencimento)}
                        <div className="text-xs text-muted-foreground">{textoDias(diasParaVencer(a.data_vencimento))}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{brl(totaisQ.data?.m?.[a.id] ?? 0)}</td>
                      <td className="px-4 py-3"><StatusBadge ata={a} /></td>
                      <td className="px-4 py-3">{a.fase_processo ?? "—"}{a.observacoes && <div className="max-w-56 truncate text-xs text-muted-foreground" title={a.observacoes}>{a.observacoes}</div>}</td>
                    </tr>
                  ))}
                  {filtradas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar ata" : "Nova ata"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <Campo label="Fornecedores (separe por vírgula)"><Input value={editando.fornecedor ?? ""} onChange={(e) => setEditando({ ...editando, fornecedor: e.target.value })} /></Campo>
              <Campo label="Data de homologação"><Input type="date" value={editando.data_homologacao ?? ""} onChange={(e) => setEditando({ ...editando, data_homologacao: e.target.value })} /></Campo>
              <Campo label="Data de vencimento *"><Input type="date" value={editando.data_vencimento ?? ""} onChange={(e) => setEditando({ ...editando, data_vencimento: e.target.value })} /></Campo>
              <Campo label="Alertar com quantos dias de antecedência?" full>
                <Input type="number" min={1} value={editando.dias_alerta ?? 90} onChange={(e) => setEditando({ ...editando, dias_alerta: Number(e.target.value) })} />
              </Campo>
              <Campo label="Fase do novo processo" full>
                <select className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={editando.fase_processo ?? ""} onChange={(e) => setEditando({ ...editando, fase_processo: e.target.value || null })}>
                  <option value="">—</option>
                  {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Campo>
              <Campo label="Observações sobre o andamento" full><Textarea placeholder="Ex.: cotação enviada a 3 fornecedores em 10/11..." value={editando.observacoes ?? ""} onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })} /></Campo>
              <Campo label="Nº do Pregão Eletrônico" full><Input placeholder="Opcional" value={editando.pregao ?? ""} onChange={(e) => setEditando({ ...editando, pregao: e.target.value })} /></Campo>
              <Campo label="Memorando (1Doc)"><Input placeholder="Opcional" value={editando.memorando_1doc ?? ""} onChange={(e) => setEditando({ ...editando, memorando_1doc: e.target.value })} /></Campo>
              <Campo label="Processo Administrativo (1Doc)"><Input placeholder="Opcional" value={editando.processo_1doc ?? ""} onChange={(e) => setEditando({ ...editando, processo_1doc: e.target.value })} /></Campo>
              <Campo label="Documentos anexos (opcional)" full><Anexos refTipo="ata" refId={editando.id} /></Campo>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarAta}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EnviarFeedback aberto={feedbackAberto} onFechar={() => setFeedbackAberto(false)} userId={userId} nome={nome} />\n      <NovoUsuario aberto={novoUsuario} onFechar={() => setNovoUsuario(false)} />
      <GerirClasses aberto={gerirClasses} onFechar={() => setGerirClasses(false)} classes={classes} />
    </div>
  );
}

export function Campo({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
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
  const [importar, setImportar] = useState(false);
  const [novo, setNovo] = useState({ descricao: "", fornecedor: "", unidade: "UN", quantidade: "1", preco_unitario: "" });

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
      fornecedor: novo.fornecedor || null,
      unidade: novo.unidade || "UN",
      quantidade: Number(novo.quantidade.replace(",", ".")),
      preco_unitario: Number(novo.preco_unitario.replace(",", ".")),
    });
    if (error) { toast.error(error.message); return; }
    setNovo({ descricao: "", fornecedor: novo.fornecedor, unidade: "UN", quantidade: "1", preco_unitario: "" });
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
        <Info rotulo="Processo" valor={`${ata.processo ?? "—"}${ata.fase_processo ? " · " + ata.fase_processo : ""}`} />
        <Info rotulo="Fornecedores" valor={fornecedoresDe(ata, itens.map((i) => i.fornecedor ?? "").filter(Boolean)) || "—"} />
        <Info rotulo="Homologação" valor={dataBR(ata.data_homologacao)} />
        <Info rotulo="Vencimento" valor={`${dataBR(ata.data_vencimento)} · ${textoDias(dias)}`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Itens da ata</h3>
        <Button variant="outline" onClick={() => setImportar(true)}><FileUp className="h-4 w-4" /> Importar itens (PDF ou planilha)</Button>
      </div>
      <ImportarItens ataId={ata.id} aberto={importar} onFechar={() => setImportar(false)} onImportado={recarregar} />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Descrição</th>
              <th className="px-4 py-3 font-medium">Fornecedor</th>
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
                <td className="px-4 py-2.5 text-muted-foreground">{i.fornecedor ?? "—"}</td>
                <td className="px-4 py-2.5">{i.unidade}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{Number(i.quantidade).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{brl(Number(i.preco_unitario))}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{brl(Number(i.preco_total))}</td>
                <td className="px-2"><Button variant="ghost" size="icon" aria-label="Remover item" onClick={() => removerItem(i)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            <tr className="border-t bg-muted/50">
              <td colSpan={6} className="px-4 py-3 text-right font-semibold">Valor total da ata</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{brl(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <form onSubmit={addItem} className="grid gap-2 border-t p-4 sm:grid-cols-[1fr_180px_80px_100px_140px_auto]">
          <Input placeholder="Descrição do item" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          <Input placeholder="Fornecedor" value={novo.fornecedor} onChange={(e) => setNovo({ ...novo, fornecedor: e.target.value })} />
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
