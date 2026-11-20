import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, FileText, Plus, RefreshCw, Search, Wallet } from "lucide-react";

type Adiantamento = Tables<"adiantamentos">;

function somarDias(data: string, dias: number): string {
  if (!data || !Number.isInteger(dias) || dias <= 0) return "";
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) return "";
  const resultado = new Date(Date.UTC(ano, mes - 1, dia));
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado.toISOString().slice(0, 10);
}

function dataBR(data: string): string {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : data;
}

export function Adiantamentos({ onVoltar }: { onVoltar: () => void }) {
  const qc = useQueryClient();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [processo1Doc, setProcesso1Doc] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState("");
  const [periodoAplicacao, setPeriodoAplicacao] = useState("");
  const [numeroEmpenho, setNumeroEmpenho] = useState("");

  const consulta = useQuery({
    queryKey: ["adiantamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("adiantamentos")
        .select("*")
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return data as Adiantamento[];
    },
  });

  const lista = consulta.data ?? [];
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return lista;
    return lista.filter((item) =>
      [item.processo_1doc, item.numero_empenho, dataBR(item.data_recebimento), dataBR(item.data_vencimento)]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(termo),
    );
  }, [lista, busca]);

  const dias = Number(periodoAplicacao);
  const dataVencimento = somarDias(dataRecebimento, dias);

  function limparFormulario() {
    setProcesso1Doc("");
    setDataRecebimento("");
    setPeriodoAplicacao("");
    setNumeroEmpenho("");
  }

  function fecharDialog() {
    if (salvando) return;
    setDialogAberto(false);
    limparFormulario();
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!processo1Doc.trim() || !dataRecebimento || !Number.isInteger(dias) || dias <= 0 || !dataVencimento || !numeroEmpenho.trim()) {
      toast.error("Preencha todos os campos com informações válidas.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from("adiantamentos").insert({
      processo_1doc: processo1Doc.trim(),
      data_recebimento: dataRecebimento,
      periodo_aplicacao_dias: dias,
      data_vencimento: dataVencimento,
      numero_empenho: numeroEmpenho.trim(),
    });
    setSalvando(false);

    if (error) {
      console.error("Erro ao salvar adiantamento:", error);
      toast.error(error.message.includes("adiantamentos")
        ? "Não foi possível salvar. Confirme se a migração do módulo Adiantamentos já foi aplicada no Lovable Cloud."
        : "Não foi possível cadastrar o processo. " + error.message);
      return;
    }

    toast.success("Processo de adiantamento cadastrado com sucesso.");
    setDialogAberto(false);
    limparFormulario();
    await qc.invalidateQueries({ queryKey: ["adiantamentos"] });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-1 shrink-0" onClick={onVoltar} aria-label="Voltar ao painel inicial">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="app-eyebrow">GESTÃO FINANCEIRA</div>
            <h2 className="app-page-title flex items-center gap-2"><Wallet className="h-6 w-6" /> Adiantamentos</h2>
            <p className="text-sm text-muted-foreground">Cadastro e acompanhamento dos adiantamentos financeiros recebidos.</p>
          </div>
        </div>
        <Button onClick={() => setDialogAberto(true)}>
          <Plus className="h-4 w-4" /> Novo processo
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><FileText className="h-4 w-4" /> Processos cadastrados</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{lista.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" /> Próximos vencimentos</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{lista.filter((item) => item.data_vencimento >= new Date().toISOString().slice(0, 10)).length}</div>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" placeholder="Buscar por processo 1Doc ou número do empenho..." />
      </div>

      {consulta.isLoading ? (
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Carregando processos de adiantamento...</div>
      ) : consulta.isError ? (
        <div className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive">
          Não foi possível carregar os processos. {consulta.error instanceof Error ? consulta.error.message : ""}
          <p className="mt-2 text-xs">Verifique se a migração do módulo Adiantamentos foi aplicada no banco de dados do Lovable Cloud.</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void consulta.refetch()}><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Processo (1Doc)</th>
                <th className="px-4 py-3 font-medium">Data do recebimento</th>
                <th className="px-4 py-3 font-medium">Período de aplicação</th>
                <th className="px-4 py-3 font-medium">Data do vencimento</th>
                <th className="px-4 py-3 font-medium">Nº do empenho</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => {
                const vencido = item.data_vencimento < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{item.processo_1doc}</td>
                    <td className="px-4 py-3 tabular-nums">{dataBR(item.data_recebimento)}</td>
                    <td className="px-4 py-3 tabular-nums">{item.periodo_aplicacao_dias} dia(s)</td>
                    <td className="px-4 py-3 tabular-nums">
                      <div className="flex items-center gap-2">
                        {dataBR(item.data_vencimento)}
                        {vencido && <Badge variant="destructive">Vencido</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{item.numero_empenho}</td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  {busca ? "Nenhum processo corresponde à pesquisa." : "Nenhum adiantamento cadastrado. Clique em Novo processo para começar."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogAberto} onOpenChange={(aberto) => { if (!aberto) fecharDialog(); else setDialogAberto(true); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Novo processo de adiantamento</DialogTitle>
            <DialogDescription>Informe os dados do recebimento. A data de vencimento será calculada automaticamente a partir do período de aplicação.</DialogDescription>
          </DialogHeader>
          <form id="form-adiantamento" onSubmit={(e) => void salvar(e)} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="adiantamento-processo">Nº do processo (1Doc) *</Label>
              <Input id="adiantamento-processo" value={processo1Doc} onChange={(e) => setProcesso1Doc(e.target.value)} placeholder="Informe o número do processo no 1Doc" maxLength={80} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adiantamento-recebimento">Data do recebimento *</Label>
              <Input id="adiantamento-recebimento" type="date" value={dataRecebimento} onChange={(e) => setDataRecebimento(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adiantamento-periodo">Período de aplicação (em dias) *</Label>
              <Input id="adiantamento-periodo" type="number" min={1} step={1} value={periodoAplicacao} onChange={(e) => setPeriodoAplicacao(e.target.value)} placeholder="Ex.: 30" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adiantamento-vencimento">Data do vencimento</Label>
              <Input id="adiantamento-vencimento" type="date" value={dataVencimento} readOnly aria-readonly="true" className="bg-muted" />
              <p className="text-xs text-muted-foreground">Calculada automaticamente: recebimento + período de aplicação.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adiantamento-empenho">Nº do empenho *</Label>
              <Input id="adiantamento-empenho" value={numeroEmpenho} onChange={(e) => setNumeroEmpenho(e.target.value)} placeholder="Informe o número do empenho" maxLength={80} required />
            </div>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fecharDialog} disabled={salvando}>Cancelar</Button>
            <Button type="submit" form="form-adiantamento" disabled={salvando || !dataVencimento}>
              {salvando ? "Salvando..." : "Salvar processo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
