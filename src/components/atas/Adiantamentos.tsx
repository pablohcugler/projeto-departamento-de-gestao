import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Calculator, CalendarClock, CheckCircle2, CircleDollarSign,
  FileImage, FileText, Paperclip, Pencil, Plus, RefreshCw, Search, Upload, Wallet, X,
} from "lucide-react";

type Adiantamento = Tables<"adiantamentos">;
type NotaDespesa = Tables<"adiantamento_notas">;

const LIMITE_ARQUIVO_BYTES = 15 * 1024 * 1024;

function somarDias(data: string, dias: number): string {
  if (!data || !Number.isInteger(dias) || dias <= 0) return "";
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) return "";
  const resultado = new Date(Date.UTC(ano, mes - 1, dia));
  // O dia do recebimento é o primeiro dia do período.
  resultado.setUTCDate(resultado.getUTCDate() + dias - 1);
  return resultado.toISOString().slice(0, 10);
}

function dataBR(data: string): string {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : data;
}

function diferencaDias(dataFinal: string, dataInicial: string): number {
  const [anoFinal, mesFinal, diaFinal] = dataFinal.split("-").map(Number);
  const [anoInicial, mesInicial, diaInicial] = dataInicial.split("-").map(Number);
  const finalUtc = Date.UTC(anoFinal, mesFinal - 1, diaFinal);
  const inicialUtc = Date.UTC(anoInicial, mesInicial - 1, diaInicial);
  return Math.round((finalUtc - inicialUtc) / 86_400_000);
}

function moedaBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor));
}

function lerValorMonetario(valor: string): number | null {
  if (!valor.trim()) return null;
  const numero = Number(valor.replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Math.round(numero * 100) / 100;
}

function valorParaInput(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "" : Number(valor).toFixed(2);
}

function dataHojeLocal(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function tamanhoArquivo(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function validarArquivo(file: File): string | null {
  const extensao = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extensoesImagem = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"];
  const mimeValido = file.type === "application/pdf"
    || (file.type.startsWith("image/") && file.type !== "image/svg+xml");
  const extensaoValida = extensao === "pdf" || extensoesImagem.includes(extensao);
  if (!mimeValido && !extensaoValida) return "Anexe somente arquivos PDF ou imagens (JPG, PNG, WEBP, GIF, AVIF ou HEIC).";
  if (file.type === "image/svg+xml" || extensao === "svg") return "Arquivos SVG não são aceitos. Anexe uma imagem em formato raster ou PDF.";
  if (file.size <= 0) return "O arquivo selecionado está vazio.";
  if (file.size > LIMITE_ARQUIVO_BYTES) return "O arquivo deve ter no máximo 15 MB.";
  return null;
}

export function Adiantamentos({ onVoltar }: { onVoltar: () => void }) {
  const qc = useQueryClient();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [processoSelecionado, setProcessoSelecionado] = useState<Adiantamento | null>(null);

  const [processo1Doc, setProcesso1Doc] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState("");
  const [periodoAplicacao, setPeriodoAplicacao] = useState("");
  const [numeroEmpenho, setNumeroEmpenho] = useState("");

  const [dialogNotaAberto, setDialogNotaAberto] = useState(false);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [numeroNota, setNumeroNota] = useState("");
  const [dataNota, setDataNota] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [descricaoNota, setDescricaoNota] = useState("");
  const [arquivoNota, setArquivoNota] = useState<File | null>(null);
  const [valorRecebido, setValorRecebido] = useState("");
  const [valorDespesa, setValorDespesa] = useState("");
  const [notaValorEditando, setNotaValorEditando] = useState<NotaDespesa | null>(null);
  const [valorDespesaEdicao, setValorDespesaEdicao] = useState("");
  const [dialogValorNotaAberto, setDialogValorNotaAberto] = useState(false);
  const [salvandoValorNota, setSalvandoValorNota] = useState(false);
  const [dialogResumoAberto, setDialogResumoAberto] = useState(false);
  const [finalizando, setFinalizando] = useState(false);

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

  const notasQ = useQuery({
    queryKey: ["adiantamento-notas", processoSelecionado?.id],
    enabled: !!processoSelecionado?.id,
    queryFn: async () => {
      if (!processoSelecionado?.id) return [];
      const { data, error } = await supabase
        .from("adiantamento_notas")
        .select("*")
        .eq("adiantamento_id", processoSelecionado.id)
        .order("data_nota", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as NotaDespesa[];
    },
  });

  const lista = consulta.data ?? [];
  const hojeLocal = dataHojeLocal();
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

  function limparFormularioProcesso() {
    setProcesso1Doc("");
    setDataRecebimento("");
    setPeriodoAplicacao("");
    setNumeroEmpenho("");
  }

  function fecharDialogProcesso() {
    if (salvando) return;
    setDialogAberto(false);
    limparFormularioProcesso();
  }

  async function salvarProcesso(e: FormEvent<HTMLFormElement>) {
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
    limparFormularioProcesso();
    await qc.invalidateQueries({ queryKey: ["adiantamentos"] });
  }

  function abrirDialogNovaNota() {
    if (!processoSelecionado || processoSelecionado.finalizado) {
      toast.error("Este adiantamento já foi finalizado.");
      return;
    }
    setValorRecebido(valorParaInput(processoSelecionado.valor_recebido));
    setValorDespesa("");
    setDialogNotaAberto(true);
  }

  function limparFormularioNota() {
    setNumeroNota("");
    setDataNota("");
    setFornecedor("");
    setDescricaoNota("");
    setArquivoNota(null);
    setValorRecebido("");
    setValorDespesa("");
    if (inputArquivo.current) inputArquivo.current.value = "";
  }

  function fecharDialogNota() {
    if (salvandoNota) return;
    setDialogNotaAberto(false);
    limparFormularioNota();
  }

  function selecionarArquivo(file?: File) {
    if (!file) {
      setArquivoNota(null);
      return;
    }
    const erro = validarArquivo(file);
    if (erro) {
      setArquivoNota(null);
      if (inputArquivo.current) inputArquivo.current.value = "";
      toast.error(erro);
      return;
    }
    setArquivoNota(file);
  }

  async function salvarNota(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!processoSelecionado) return;
    const valorRecebidoNumerico = lerValorMonetario(valorRecebido);
    const valorDespesaNumerico = lerValorMonetario(valorDespesa);
    if (!numeroNota.trim() || !dataNota || !fornecedor.trim() || !descricaoNota.trim()) {
      toast.error("Preencha o número, data, fornecedor e descrição da despesa.");
      return;
    }
    if (valorRecebidoNumerico === null) {
      toast.error("Informe um valor recebido válido, maior que zero.");
      return;
    }
    if (valorDespesaNumerico === null) {
      toast.error("Informe um valor de despesa válido, maior que zero.");
      return;
    }
    if (arquivoNota) {
      const erroArquivo = validarArquivo(arquivoNota);
      if (erroArquivo) {
        toast.error(erroArquivo);
        return;
      }
    }

    setSalvandoNota(true);
    const notaId = crypto.randomUUID();
    let caminhoArquivo: string | null = null;
    let mimeArquivo: string | null = null;

    try {
      if (arquivoNota) {
        const nomeSeguro = arquivoNota.name.normalize("NFD").replace(/[^\w.\-]+/g, "_");
        caminhoArquivo = `adiantamento/${processoSelecionado.id}/${notaId}/${Date.now()}_${nomeSeguro}`;
        mimeArquivo = arquivoNota.type || (arquivoNota.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");

        const { error: erroUpload } = await supabase.storage
          .from("anexos")
          .upload(caminhoArquivo, arquivoNota, {
            contentType: mimeArquivo,
            upsert: false,
          });
        if (erroUpload) throw new Error("Falha ao anexar a nota fiscal: " + erroUpload.message);
      }

      const { error: erroValorRecebido } = await supabase
        .from("adiantamentos")
        .update({ valor_recebido: valorRecebidoNumerico })
        .eq("id", processoSelecionado.id);
      if (erroValorRecebido) {
        throw new Error("Não foi possível salvar o valor recebido: " + erroValorRecebido.message);
      }

      const { error } = await supabase.from("adiantamento_notas").insert({
        id: notaId,
        adiantamento_id: processoSelecionado.id,
        numero_nota: numeroNota.trim(),
        data_nota: dataNota,
        fornecedor: fornecedor.trim(),
        descricao: descricaoNota.trim(),
        valor_despesa: valorDespesaNumerico,
        arquivo_nome: arquivoNota?.name ?? null,
        arquivo_caminho: caminhoArquivo,
        arquivo_mime_type: mimeArquivo,
        arquivo_tamanho_bytes: arquivoNota?.size ?? null,
      });
      if (error) throw new Error("Não foi possível registrar a nota: " + error.message);

      toast.success("Nota de despesa cadastrada com sucesso.");
      setProcessoSelecionado({ ...processoSelecionado, valor_recebido: valorRecebidoNumerico });
      setDialogNotaAberto(false);
      limparFormularioNota();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["adiantamento-notas", processoSelecionado.id] }),
        qc.invalidateQueries({ queryKey: ["adiantamentos"] }),
      ]);
    } catch (erro) {
      if (caminhoArquivo) {
        const { error: erroRemocao } = await supabase.storage.from("anexos").remove([caminhoArquivo]);
        if (erroRemocao) console.error("Falha ao remover arquivo após erro no registro:", erroRemocao);
      }
      console.error("Erro ao cadastrar nota:", erro);
      toast.error(erro instanceof Error ? erro.message : "Não foi possível cadastrar a nota.");
    } finally {
      setSalvandoNota(false);
    }
  }

  function abrirEdicaoValorNota(nota: NotaDespesa) {
    if (processoSelecionado?.finalizado) return;
    setNotaValorEditando(nota);
    setValorDespesaEdicao(valorParaInput(nota.valor_despesa));
    setDialogValorNotaAberto(true);
  }

  async function salvarValorNota() {
    if (!notaValorEditando || !processoSelecionado || salvandoValorNota) return;
    const valor = lerValorMonetario(valorDespesaEdicao);
    if (valor === null) {
      toast.error("Informe um valor de despesa válido, maior que zero.");
      return;
    }
    setSalvandoValorNota(true);
    const { error } = await supabase
      .from("adiantamento_notas")
      .update({ valor_despesa: valor })
      .eq("id", notaValorEditando.id);
    setSalvandoValorNota(false);
    if (error) {
      toast.error("Não foi possível atualizar o valor da nota: " + error.message);
      return;
    }
    setDialogValorNotaAberto(false);
    setNotaValorEditando(null);
    setValorDespesaEdicao("");
    toast.success("Valor da despesa atualizado.");
    await qc.invalidateQueries({ queryKey: ["adiantamento-notas", processoSelecionado.id] });
  }

  async function confirmarFinalizacao() {
    if (!processoSelecionado || finalizando) return;
    setFinalizando(true);
    const { data, error } = await supabase.rpc("finalizar_adiantamento", {
      p_adiantamento_id: processoSelecionado.id,
    });
    setFinalizando(false);
    if (error) {
      toast.error("Não foi possível finalizar o adiantamento: " + error.message);
      return;
    }
    const resultado = data as {
      finalizado?: boolean;
      finalizado_em?: string;
      valor_recebido?: number;
    };
    setProcessoSelecionado({
      ...processoSelecionado,
      finalizado: true,
      finalizado_em: resultado.finalizado_em ?? new Date().toISOString(),
    });
    setDialogResumoAberto(false);
    toast.success("Adiantamento finalizado. A prestação de contas foi confirmada.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["adiantamentos"] }),
      qc.invalidateQueries({ queryKey: ["adiantamento-notas", processoSelecionado.id] }),
    ]);
  }

  async function abrirArquivo(caminho: string) {
    const { data, error } = await supabase.storage.from("anexos").createSignedUrl(caminho, 300);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o documento anexado.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (processoSelecionado) {
    const notas = notasQ.data ?? [];
    const valoresPendentes = notas.filter((nota) => nota.valor_despesa === null || nota.valor_despesa <= 0);
    const totalDespesas = notas.reduce((total, nota) => total + (Number(nota.valor_despesa) || 0), 0);
    const valorRecebidoAtual = processoSelecionado.valor_recebido;
    const saldoFinanceiro = valorRecebidoAtual === null
      ? null
      : Math.round((Number(valorRecebidoAtual) - totalDespesas) * 100) / 100;
    const valorDevolucao = saldoFinanceiro === null ? null : Math.max(0, saldoFinanceiro);
    const despesasExcedentes = saldoFinanceiro !== null && saldoFinanceiro < 0 ? Math.abs(saldoFinanceiro) : 0;
    const podeFinalizar = !processoSelecionado.finalizado
      && valorRecebidoAtual !== null
      && Number(valorRecebidoAtual) > 0
      && valoresPendentes.length === 0
      && despesasExcedentes === 0
      && !notasQ.isLoading
      && !notasQ.isError;
    const diasParaVencer = diferencaDias(processoSelecionado.data_vencimento, hojeLocal);
    const vencido = diasParaVencer < 0;
    const venceHoje = diasParaVencer === 0;
    const estiloPrazo = vencido || venceHoje
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : diasParaVencer <= 7
        ? "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300"
        : "border-primary/25 bg-primary/5 text-foreground";
    return (
      <section className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="icon" className="mt-1 shrink-0" onClick={() => setProcessoSelecionado(null)} aria-label="Voltar à lista de adiantamentos">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <div className="app-eyebrow">PROCESSO DE ADIANTAMENTO</div>
              <h2 className="app-page-title">{processoSelecionado.processo_1doc}</h2>
              <p className="text-sm text-muted-foreground">Empenho nº {processoSelecionado.numero_empenho}</p>
            </div>
          </div>
          <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
            <div className="flex flex-wrap justify-end gap-2">
              {processoSelecionado.finalizado && <Badge className="self-center"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Finalizado</Badge>}
              <Button onClick={abrirDialogNovaNota} disabled={processoSelecionado.finalizado}>
                <Plus className="h-4 w-4" /> Nova nota
              </Button>
            </div>
            <div className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-right sm:w-[300px] ${estiloPrazo}`} role="status" aria-live="polite">
              <CalendarClock className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide">Prazo da prestação de contas</div>
                <div className="text-sm font-bold tabular-nums">
                  {vencido
                    ? `Vencido há ${Math.abs(diasParaVencer)} dia(s)`
                    : venceHoje
                      ? "Vence hoje — envie a prestação"
                      : `Faltam ${diasParaVencer} dia(s) para vencer`}
                </div>
                <div className="text-[11px] opacity-80">Até {dataBR(processoSelecionado.data_vencimento)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">Data do recebimento</div><div className="mt-2 text-lg font-semibold tabular-nums">{dataBR(processoSelecionado.data_recebimento)}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">Período de aplicação</div><div className="mt-2 text-lg font-semibold tabular-nums">{processoSelecionado.periodo_aplicacao_dias} dia(s)</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">Data do vencimento</div><div className="mt-2 flex items-center gap-2 text-lg font-semibold tabular-nums">{dataBR(processoSelecionado.data_vencimento)}{vencido && <Badge variant="destructive">Vencido</Badge>}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">Notas cadastradas</div><div className="mt-2 text-lg font-semibold tabular-nums">{notas.length}</div></div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Notas de despesas</h3>
            <p className="text-sm text-muted-foreground">Cadastre as notas fiscais e os respectivos comprovantes das despesas deste adiantamento.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void notasQ.refetch()} disabled={notasQ.isFetching}>
              <RefreshCw className="h-4 w-4" /> Atualizar notas
            </Button>
            <Button onClick={() => setDialogResumoAberto(true)} disabled={notasQ.isLoading || notasQ.isError}>
              <Calculator className="h-4 w-4" /> {processoSelecionado.finalizado ? "Ver resumo financeiro" : "Finalizar adiantamento"}
            </Button>
          </div>
        </div>

        {notasQ.isLoading ? (
          <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Carregando notas de despesas...</div>
        ) : notasQ.isError ? (
          <div className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive">
            Não foi possível carregar as notas. {notasQ.error instanceof Error ? notasQ.error.message : ""}
            <p className="mt-2 text-xs">Confirme se a migração das notas de adiantamento foi aplicada no banco do Lovable Cloud.</p>
          </div>
        ) : notas.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-muted"><FileText className="h-6 w-6 text-muted-foreground" /></div>
            <h4 className="mt-3 font-semibold">Nenhuma nota cadastrada</h4>
            <p className="mt-1 text-sm text-muted-foreground">Clique em Nova nota para registrar a primeira despesa deste processo.</p>
            <Button className="mt-4" onClick={() => setDialogNotaAberto(true)}><Plus className="h-4 w-4" /> Nova nota</Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <ol className="divide-y" aria-label="Notas de despesas em ordem cronológica">
              {notas.map((nota, indice) => (
                <li key={nota.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold tabular-nums text-foreground">
                      {indice + 1}
                    </span>
                    <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Nota nº {nota.numero_nota}</span>
                      <Badge variant="outline">{dataBR(nota.data_nota)}</Badge>
                    </div>
                    <div className="text-sm font-medium">{nota.fornecedor}</div>
                    <p className="text-sm text-muted-foreground">{nota.descricao}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-sm font-semibold tabular-nums">
                        {nota.valor_despesa === null ? "Valor não informado" : moedaBRL(nota.valor_despesa)}
                      </span>
                      {!processoSelecionado.finalizado && (
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => abrirEdicaoValorNota(nota)}>
                          <Pencil className="mr-1 h-3 w-3" /> {nota.valor_despesa === null ? "Informar valor" : "Ajustar valor"}
                        </Button>
                      )}
                    </div>
                    {nota.arquivo_nome ? (
                      <button type="button" className="inline-flex max-w-full items-center gap-2 text-sm text-primary hover:underline" onClick={() => void abrirArquivo(nota.arquivo_caminho!)}>
                        <Paperclip className="h-4 w-4 shrink-0" /><span className="truncate">{nota.arquivo_nome}</span>
                        {nota.arquivo_tamanho_bytes ? <span className="shrink-0 text-xs text-muted-foreground">({tamanhoArquivo(nota.arquivo_tamanho_bytes)})</span> : null}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3.5 w-3.5" /> Sem arquivo anexado</span>
                    )}
                    </div>
                  </div>
                  {nota.arquivo_mime_type?.startsWith("image/") && (
                    <Badge variant="secondary" className="w-fit shrink-0"><FileImage className="mr-1 h-3.5 w-3.5" /> Imagem</Badge>
                  )}
                  {nota.arquivo_mime_type === "application/pdf" && (
                    <Badge variant="secondary" className="w-fit shrink-0"><FileText className="mr-1 h-3.5 w-3.5" /> PDF</Badge>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        <Dialog open={dialogNotaAberto} onOpenChange={(aberto) => { if (!aberto) fecharDialogNota(); else setDialogNotaAberto(true); }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Nova nota de despesa</DialogTitle>
              <DialogDescription>Registre os dados da nota fiscal vinculada ao processo {processoSelecionado.processo_1doc}.</DialogDescription>
            </DialogHeader>
            <form id="form-nota-adiantamento" onSubmit={(e) => void salvarNota(e)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nota-numero">Número da Nota *</Label>
                  <Input id="nota-numero" value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} placeholder="Número da nota fiscal" maxLength={80} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nota-data">Data *</Label>
                  <Input id="nota-data" type="date" value={dataNota} onChange={(e) => setDataNota(e.target.value)} required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="nota-fornecedor">Fornecedor *</Label>
                  <Input id="nota-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Nome ou razão social do fornecedor" maxLength={180} required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="nota-descricao">Descrição sucinta da despesa *</Label>
                  <Textarea id="nota-descricao" value={descricaoNota} onChange={(e) => setDescricaoNota(e.target.value)} placeholder="Descreva resumidamente a despesa realizada..." rows={3} maxLength={1500} required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nota fiscal (PDF ou imagem)</Label>
                  <input
                    ref={inputArquivo}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif,application/pdf,image/*"
                    onChange={(e) => selecionarArquivo(e.target.files?.[0])}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => inputArquivo.current?.click()} disabled={salvandoNota}>
                      <Upload className="h-4 w-4" /> Anexar arquivo
                    </Button>
                    {arquivoNota && (
                      <Button type="button" variant="ghost" size="icon" aria-label="Remover arquivo selecionado" onClick={() => selecionarArquivo(undefined)} disabled={salvandoNota}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {arquivoNota ? (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                      {arquivoNota.type === "application/pdf" ? <FileText className="h-4 w-4 shrink-0" /> : <FileImage className="h-4 w-4 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{arquivoNota.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{tamanhoArquivo(arquivoNota.size)}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Selecione um PDF ou uma imagem. Tamanho máximo: 15 MB. O anexo é opcional.</p>
                  )}
                </div>
              </div>
            </form>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={fecharDialogNota} disabled={salvandoNota}>Cancelar</Button>
              <Button type="submit" form="form-nota-adiantamento" disabled={salvandoNota}>
                {salvandoNota ? "Salvando nota..." : "Salvar nota"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    );
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" /> A vencer</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{lista.filter((item) => item.data_vencimento >= hojeLocal).length}</div>
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
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Processo (1Doc)</th>
                <th className="px-4 py-3 font-medium">Data do recebimento</th>
                <th className="px-4 py-3 font-medium">Período de aplicação</th>
                <th className="px-4 py-3 font-medium">Data do vencimento</th>
                <th className="px-4 py-3 font-medium">Nº do empenho</th>
                <th className="px-4 py-3 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => {
                const vencido = item.data_vencimento < hojeLocal;
                return (
                  <tr
                    key={item.id}
                    className="cursor-pointer border-t transition-colors hover:bg-muted/50"
                    onClick={() => setProcessoSelecionado(item)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setProcessoSelecionado(item); }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir processo ${item.processo_1doc} para lançar notas de despesas`}
                  >
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
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setProcessoSelecionado(item); }}>
                        Abrir processo
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {busca ? "Nenhum processo corresponde à pesquisa." : "Nenhum adiantamento cadastrado. Clique em Novo processo para começar."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogAberto} onOpenChange={(aberto) => { if (!aberto) fecharDialogProcesso(); else setDialogAberto(true); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Novo processo de adiantamento</DialogTitle>
            <DialogDescription>Informe os dados do recebimento. A data de vencimento será calculada automaticamente a partir do período de aplicação.</DialogDescription>
          </DialogHeader>
          <form id="form-adiantamento" onSubmit={(e) => void salvarProcesso(e)} className="grid gap-4 sm:grid-cols-2">
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
            <Button type="button" variant="outline" onClick={fecharDialogProcesso} disabled={salvando}>Cancelar</Button>
            <Button type="submit" form="form-adiantamento" disabled={salvando || !dataVencimento}>
              {salvando ? "Salvando..." : "Salvar processo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
