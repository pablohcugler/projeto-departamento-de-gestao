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
import { AlertTriangle, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { brl, dataBR, diasParaVencer, statusAta } from "@/lib/vencimento";
import { Campo, StatusBadge, textoDias } from "./Painel";

type Contrato = Tables<"contratos">;
type Classe = Tables<"classificacoes">;

export function Contratos({ classes, onGerirClasses }: { classes: Classe[]; onGerirClasses: () => void }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Partial<Contrato> | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");

  const q = useQuery({
    queryKey: ["contratos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contratos").select("*").order("data_vencimento");
      if (error) throw error;
      return data;
    },
  });
  const lista = q.data ?? [];
  const nomeClasse = (id: string | null) => classes.find((c) => c.id === id)?.nome;
  const filtrados = useMemo(
    () =>
      lista.filter(
        (c) =>
          (filtro === "todas" || (filtro === "sem" ? !c.classificacao_id : c.classificacao_id === filtro)) &&
          `${c.numero} ${c.objeto} ${c.contratado ?? ""}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [lista, filtro, busca],
  );
  const alertas = lista.filter((c) => statusAta(c.data_vencimento, c.dias_alerta) !== "vigente");

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

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Contratos</h2>
          <p className="text-sm text-muted-foreground">{lista.length} contrato(s) no total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onGerirClasses}><Tags className="h-4 w-4" /> Classificações</Button>
          <Button onClick={() => setEditando({ dias_alerta: 90 })}><Plus className="h-4 w-4" /> Novo contrato</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Buscar por número, objeto, contratado..." className="w-full sm:max-w-xs" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todas">Todas as classificações</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="sem">Sem classificação</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nº Contrato</th>
              <th className="px-4 py-3 font-medium">Objeto</th>
              <th className="px-4 py-3 font-medium">Classificação</th>
              <th className="px-4 py-3 font-medium">Contratado</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Vencimento</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => {
              const st = statusAta(c.data_vencimento, c.dias_alerta);
              return (
                <tr key={c.id} className={`border-t ${st === "vencida" ? "bg-destructive/10" : st === "alerta" ? "bg-warning/15" : ""}`}>
                  <td className="px-4 py-3 font-medium">{c.numero}</td>
                  <td className="px-4 py-3">{c.objeto}</td>
                  <td className="px-4 py-3 text-muted-foreground">{nomeClasse(c.classificacao_id) ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.contratado ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.valor != null ? brl(Number(c.valor)) : "—"}</td>
                  <td className="px-4 py-3">
                    {dataBR(c.data_vencimento)}
                    <div className="text-xs text-muted-foreground">{textoDias(diasParaVencer(c.data_vencimento))}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge ata={c} /></td>
                  <td className="whitespace-nowrap px-2">
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditando(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => excluir(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">{q.isLoading ? "Carregando..." : "Nenhum contrato encontrado. Clique em “Novo contrato” para começar."}</td></tr>
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
