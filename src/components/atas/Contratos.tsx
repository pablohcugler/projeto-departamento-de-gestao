import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Anexos } from "./Anexos";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, FileText, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { brl, dataBR, diasParaVencer, statusAta } from "@/lib/vencimento";
import { Campo, StatusBadge, textoDias } from "./Painel";

type Contrato = Tables<"contratos">;
type Classe = Tables<"classificacoes">;

export function Contratos({ classes, onGerirClasses, filtroSituacao }: { classes: Classe[]; onGerirClasses: () => void; filtroSituacao: "todas" | "Em andamento" | "Vigentes" }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Partial<Contrato> | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [situacao, setSituacao] = useState<"todas" | "vigente" | "alerta" | "vencida">("todas");

  const q = useQuery({
    queryKey: ["contratos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contratos").select("*").order("data_vencimento");
      if (error) throw error;
      return data;
    },
  });
  const lista = q.data ?? [];
  const contratosPorSituacao = lista.filter(
    (contrato) => filtroSituacao === "todas" || contrato.situacao_cadastro === filtroSituacao,
  );
  const nomeClasse = (id: string | null) => classes.find((c) => c.id === id)?.nome;
  const filtrados = useMemo(
    () =>
      contratosPorSituacao.filter(
        (c) =>
          (filtro === "todas" || (filtro === "sem" ? !c.classificacao_id : c.classificacao_id === filtro)) &&
          (filtroSituacao === "todas" || c.situacao_cadastro === filtroSituacao) &&
          (situacao === "todas" || statusAta(c.data_vencimento, c.dias_alerta) === situacao) &&
          `${c.numero} ${c.objeto} ${c.contratado ?? ""}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [contratosPorSituacao, filtro, situacao, busca],
  );
  const alertas = contratosPorSituacao.filter((c) => statusAta(c.data_vencimento, c.dias_alerta) !== "vigente");
  const resumo = contratosPorSituacao.reduce((acc, c) => {
    acc[statusAta(c.data_vencimento, c.dias_alerta)] += 1;
    acc.valor += Number(c.valor ?? 0);
    return acc;
  }, { vigente: 0, alerta: 0, vencida: 0, valor: 0 });

  async function salvar() {
    if (!editando?.numero || !editando.objeto || !editando.data_vencimento) {
      toast.error("Preencha número, objeto e data de vencimento.");
      return;
    }
    const valorTxt = String(editando.valor ?? "").replace(/\./g, "").replace(",", ".");
    const payload = {
      numero: editando.numero,
      objeto: editando.objeto,
      contratado: editando.contratado || null,
      valor: valorTxt ? Number(valorTxt) : null,
      data_inicio: editando.data_inicio || null,
      data_vencimento: editando.data_vencimento,
      dias_alerta: Number(editando.dias_alerta ?? 90),
      classificacao_id: editando.classificacao_id || null,
      observacoes: editando.observacoes || null,
      pregao: editando.pregao || null,
      memorando_1doc: editando.memorando_1doc || null,
      processo_1doc: editando.processo_1doc || null,
      situacao_cadastro: editando.situacao_cadastro ?? "Em andamento",
    };
    const { error } = editando.id
      ? await supabase.from("contratos").update(payload).eq("id", editando.id)
      : await supabase.from("contratos").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Contrato salvo.");
    setEditando(null);
    qc.invalidateQueries({ queryKey: ["contratos"] });
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este contrato?")) return;
    await supabase.from("contratos").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["contratos"] });
  }

  return (
    <>
      {alertas.length > 0 && (
        <section className="mb-8 rounded-xl border-2 border-destructive bg-destructive/10 p-5">
          <div className="mb-3 flex items-center gap-2 text-lg font-semibold text-destructive">
            <AlertTriangle className="h-6 w-6" />
            Atenção: {alertas.length} contrato(s) vencido(s) ou próximo(s) do vencimento
          </div>
          <ul className="space-y-1.5 text-sm">
            {alertas.map((c) => (
              <li key={c.id}>
                <strong>Contrato {c.numero}</strong> — {c.objeto} · vence em {dataBR(c.data_vencimento)} ({textoDias(diasParaVencer(c.data_vencimento))})
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Contratos</h2>
          <p className="text-sm text-muted-foreground">Acompanhamento de vigência, valores e responsabilidades contratuais</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onGerirClasses}><Tags className="h-4 w-4" /> Classificações</Button>
          <Button onClick={() => setEditando({ dias_alerta: 90, situacao_cadastro: "Em andamento" })}><Plus className="h-4 w-4" /> Novo contrato</Button>
        </div>
      </div>

      <section className="app-contract-summary mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo dos contratos">
        <button onClick={() => setSituacao("todas")} className={`rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 ${situacao === "todas" ? "border-primary ring-1 ring-primary/20" : ""}`}>
          <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Total de contratos</span><FileText className="h-4 w-4" /></div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{lista.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">Valor cadastrado: {brl(resumo.valor)}</div>
        </button>
        <button onClick={() => setSituacao("vigente")} className={`rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-success/60 ${situacao === "vigente" ? "border-success ring-1 ring-success/20" : ""}`}>
          <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Vigentes</span><CheckCircle2 className="h-4 w-4 text-success" /></div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{resumo.vigente}</div>
          <div className="mt-1 text-xs text-muted-foreground">Dentro do prazo de vigência</div>
        </button>
        <button onClick={() => setSituacao("alerta")} className={`rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-warning ${situacao === "alerta" ? "border-warning ring-1 ring-warning/20" : ""}`}>
          <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Próximos do vencimento</span><Clock3 className="h-4 w-4 text-warning" /></div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{resumo.alerta}</div>
          <div className="mt-1 text-xs text-muted-foreground">Exigem acompanhamento</div>
        </button>
        <button onClick={() => setSituacao("vencida")} className={`rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-destructive ${situacao === "vencida" ? "border-destructive ring-1 ring-destructive/20" : ""}`}>
          <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Vencidos</span><CalendarClock className="h-4 w-4 text-destructive" /></div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{resumo.vencida}</div>
          <div className="mt-1 text-xs text-muted-foreground">Requerem providência administrativa</div>
        </button>
      </section>

      <div className="app-toolbar mb-4 flex flex-wrap gap-2">
        <Input placeholder="Buscar por número, objeto, contratado..." className="w-full sm:max-w-xs" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todas">Todas as classificações</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="sem">Sem classificação</option>
        </select>
      </div>

      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{filtrados.length} contrato(s) exibido(s) nesta situação</span>
        {situacao !== "todas" && <button className="font-medium text-primary hover:underline" onClick={() => setSituacao("todas")}>Limpar filtro de situação</button>}
      </div>
      <div className="app-responsive-table overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nº Contrato</th>
              <th className="px-4 py-3 font-medium">Objeto</th>
              <th className="px-4 py-3 font-medium">Classificação</th>
              <th className="px-4 py-3 font-medium">Contratado</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Vencimento</th>
              <th className="px-4 py-3 font-medium">Cadastro</th>
              <th className="px-4 py-3 font-medium">Situação do vencimento</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => {
              const st = statusAta(c.data_vencimento, c.dias_alerta);
              return (
                <tr key={c.id} className={`border-t ${st === "vencida" ? "bg-destructive/10" : st === "alerta" ? "bg-warning/15" : ""}`}>
                  <td data-label="Nº Contrato" className="px-4 py-3 font-medium">{c.numero}</td>
                  <td data-label="Objeto" className="px-4 py-3">{c.objeto}</td>
                  <td data-label="Classificação" className="px-4 py-3 text-muted-foreground">{nomeClasse(c.classificacao_id) ?? "—"}</td>
                  <td data-label="Contratado" className="px-4 py-3 text-muted-foreground">{c.contratado ?? "—"}</td>
                  <td data-label="Valor" className="px-4 py-3 text-right tabular-nums">{c.valor != null ? brl(Number(c.valor)) : "—"}</td>
                  <td data-label="Vencimento" className="px-4 py-3">
                    {dataBR(c.data_vencimento)}
                    <div className="text-xs text-muted-foreground">{textoDias(diasParaVencer(c.data_vencimento))}</div>
                  </td>
                  <td data-label="Cadastro" className="px-4 py-3">
                    <span className={c.situacao_cadastro === "Vigentes" ? "rounded-full bg-success/15 px-2.5 py-1 text-xs text-success" : "rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"}>{c.situacao_cadastro}</span>
                  </td>
                  <td data-label="Situação do vencimento" className="px-4 py-3"><StatusBadge ata={c} /></td>
                  <td data-label="Ações" className="whitespace-nowrap px-2">
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditando(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => excluir(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                {q.isLoading ? "Carregando contratos..." : q.isError ? "Não foi possível carregar os contratos. Atualize a página e tente novamente." : "Nenhum contrato corresponde aos filtros selecionados."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editando?.id ? "Editar contrato" : "Novo contrato"}</DialogTitle></DialogHeader>
          {editando && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Nº do contrato *"><Input value={editando.numero ?? ""} onChange={(e) => setEditando({ ...editando, numero: e.target.value })} /></Campo>
              <Campo label="Valor (R$)"><Input inputMode="decimal" value={editando.valor ?? ""} onChange={(e) => setEditando({ ...editando, valor: e.target.value as unknown as number })} /></Campo>
              <Campo label="Objeto *" full><Input value={editando.objeto ?? ""} onChange={(e) => setEditando({ ...editando, objeto: e.target.value })} /></Campo>
              <Campo label="Contratado"><Input value={editando.contratado ?? ""} onChange={(e) => setEditando({ ...editando, contratado: e.target.value })} /></Campo>
              <Campo label="Situação do cadastro">
                <select className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={editando.situacao_cadastro ?? "Em andamento"} onChange={(e) => setEditando({ ...editando, situacao_cadastro: e.target.value })}>
                  <option value="Em andamento">Em andamento</option>
                  <option value="Vigentes">Vigentes</option>
                </select>
              </Campo>
              <Campo label="Classificação">
                <select className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={editando.classificacao_id ?? ""} onChange={(e) => setEditando({ ...editando, classificacao_id: e.target.value || null })}>
                  <option value="">Sem classificação</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Início da vigência"><Input type="date" value={editando.data_inicio ?? ""} onChange={(e) => setEditando({ ...editando, data_inicio: e.target.value })} /></Campo>
              <Campo label="Vencimento *"><Input type="date" value={editando.data_vencimento ?? ""} onChange={(e) => setEditando({ ...editando, data_vencimento: e.target.value })} /></Campo>
              <Campo label="Alertar com quantos dias de antecedência?" full><Input type="number" min={1} value={editando.dias_alerta ?? 90} onChange={(e) => setEditando({ ...editando, dias_alerta: Number(e.target.value) })} /></Campo>
              <Campo label="Observações" full><Textarea value={editando.observacoes ?? ""} onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })} /></Campo>
              <Campo label="Nº do Pregão Eletrônico" full><Input placeholder="Opcional" value={editando.pregao ?? ""} onChange={(e) => setEditando({ ...editando, pregao: e.target.value })} /></Campo>
              <Campo label="Memorando (1Doc)"><Input placeholder="Opcional" value={editando.memorando_1doc ?? ""} onChange={(e) => setEditando({ ...editando, memorando_1doc: e.target.value })} /></Campo>
              <Campo label="Processo Administrativo (1Doc)"><Input placeholder="Opcional" value={editando.processo_1doc ?? ""} onChange={(e) => setEditando({ ...editando, processo_1doc: e.target.value })} /></Campo>
              <Campo label="Documentos anexos (opcional)" full><Anexos refTipo="contrato" refId={editando.id} /></Campo>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
