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
  ArrowLeft, CalendarClock, FileImage, FileText, Paperclip, Plus, RefreshCw,
  Search, Upload, Wallet, X,
} from "lucide-react";

type Adiantamento = Tables<"adiantamentos">;
type NotaDespesa = Tables<"adiantamento_notas">;

const LIMITE_ARQUIVO_BYTES = 15 * 1024 * 1024;

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
        .order("data_nota", { ascending: false })
        .order("created_at", { ascending: false });
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

  function limparFormularioNota() {
    setNumeroNota("");
    setDataNota("");
    setFornecedor("");
    setDescricaoNota("");
    setArquivoNota(null);
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
    if (!numeroNota.trim() || !dataNota || !fornecedor.trim() || !descricaoNota.trim()) {
      toast.error("Preencha o número, data, fornecedor e descrição da despesa.");
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

      const { error } = await supabase.from("adiantamento_notas").insert({
        id: notaId,
        adiantamento_id: processoSelecionado.id,
        numero_nota: numeroNota.trim(),
        data_nota: dataNota,
        fornecedor: fornecedor.trim(),
        descricao: descricaoNota.trim(),
        arquivo_nome: arquivoNota?.name ?? null,
        arquivo_caminho: caminhoArquivo,
        arquivo_mime_type: mimeArquivo,
        arquivo_tamanho_bytes: arquivoNota?.size ?? null,
      });
      if (error) throw new Error("Não foi possível registrar a nota: " + error.message);

      toast.success("Nota de despesa cadastrada com sucesso.");
      setDialogNotaAberto(false);
      limparFormularioNota();
      await qc.invalidateQueries({ queryKey: ["adiantamento-notas", processoSelecionado.id] });
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
    const vencido = processoSelecionado.data_vencimento < hojeLocal;
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
          <Button onClick={() => setDialogNotaAberto(true)}>
            <Plus className="h-4 w-4" /> Nova nota
          </Button>
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
          <Button variant="outline" onClick={() => void notasQ.refetch()} disabled={notasQ.isFetching}>
            <RefreshCw className="h-4 w-4" /> Atualizar notas
          </Button>
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
            <div className="divide-y">
              {notas.map((nota) => (
                <article key={nota.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Nota nº {nota.numero_nota}</span>
                      <Badge variant="outline">{dataBR(nota.data_nota)}</Badge>
                    </div>
                    <div className="text-sm font-medium">{nota.fornecedor}</div>
                    <p className="text-sm text-muted-foreground">{nota.descricao}</p>
                    {nota.arquivo_nome ? (
                      <button type="button" className="inline-flex max-w-full items-center gap-2 text-sm text-primary hover:underline" onClick={() => void abrirArquivo(nota.arquivo_caminho!)}>
                        <Paperclip className="h-4 w-4 shrink-0" /><span className="truncate">{nota.arquivo_nome}</span>
                        {nota.arquivo_tamanho_bytes ? <span className="shrink-0 text-xs text-muted-foreground">({tamanhoArquivo(nota.arquivo_tamanho_bytes)})</span> : null}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3.5 w-3.5" /> Sem arquivo anexado</span>
                    )}
                  </div>
                  {nota.arquivo_mime_type?.startsWith("image/") && (
                    <Badge variant="secondary" className="w-fit shrink-0"><FileImage className="mr-1 h-3.5 w-3.5" /> Imagem</Badge>
                  )}
                  {nota.arquivo_mime_type === "application/pdf" && (
                    <Badge variant="secondary" className="w-fit shrink-0"><FileText className="mr-1 h-3.5 w-3.5" /> PDF</Badge>
                  )}
                </article>
              ))}
            </div>
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
