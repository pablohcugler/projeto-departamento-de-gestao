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
import { gerarRelatorioAdiantamento, type AnexoRelatorio } from "@/lib/relatorio-adiantamento";
import { gerarAnexoIIDespesas, gerarDepositoSaldoRemanescente } from "@/lib/relatorios-prestacao-adiantamento";
import { criarArquivoZip } from "@/lib/zip";
import {
  AlertTriangle, ArrowLeft, Calculator, CalendarClock, CheckCircle2, CircleDollarSign,
  FileText, Files, Paperclip, Pencil, Plus, RefreshCw, RotateCcw, Search, Settings2, Trash2, Upload, Wallet, X, Download, Archive,
} from "lucide-react";

type Adiantamento = Tables<"adiantamentos">;
type NotaDespesa = Tables<"adiantamento_notas">;
type DocumentoComplementar = Tables<"adiantamento_nota_documentos">;
type ArquivoPrestacao = Tables<"adiantamento_prestacao_arquivos">;

const LIMITE_ARQUIVO_BYTES = 15 * 1024 * 1024;
const LIMITE_DOCUMENTOS_COMPLEMENTARES = 20;
const LIMITE_TOTAL_COMPLEMENTARES_BYTES = 100 * 1024 * 1024;

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
  const limpo = valor.trim().replace(/R\$|\s/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizado)) return null;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Math.round(numero * 100) / 100;
}

function valorParaInput(valor: number | null | undefined): string {
  return valor === null || valor === undefined
    ? ""
    : Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function validarDocumentoComplementar(file: File): string | null {
  const extensao = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extensoesPermitidas = [
    "pdf", "jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif",
    "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt",
  ];
  const mimePermitido = file.type === "application/pdf"
    || file.type.startsWith("image/")
    || file.type === "application/msword"
    || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || file.type === "application/vnd.ms-excel"
    || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || file.type === "application/vnd.ms-powerpoint"
    || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    || file.type === "text/plain";
  if (extensao === "svg" || file.type === "image/svg+xml") return "Arquivos SVG não são aceitos.";
  if (!extensoesPermitidas.includes(extensao) && !mimePermitido) {
    return "Formato não permitido. Use PDF, imagens, Word, Excel, PowerPoint ou TXT.";
  }
  if (file.size <= 0) return "Um dos arquivos selecionados está vazio.";
  if (file.size > LIMITE_ARQUIVO_BYTES) return `O arquivo ${file.name} ultrapassa o limite de 15 MB.`;
  return null;
}

export function Adiantamentos({ onVoltar }: { onVoltar: () => void }) {
  const qc = useQueryClient();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const inputDocumentosComplementares = useRef<HTMLInputElement>(null);
  const inputComprovanteDevolucao = useRef<HTMLInputElement>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [processoSelecionado, setProcessoSelecionado] = useState<Adiantamento | null>(null);

  const [processo1Doc, setProcesso1Doc] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState("");
  const [periodoAplicacao, setPeriodoAplicacao] = useState("");
  const [numeroEmpenho, setNumeroEmpenho] = useState("");
  const [valorRecebidoProcesso, setValorRecebidoProcesso] = useState("");

  const [dialogNotaAberto, setDialogNotaAberto] = useState(false);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [numeroNota, setNumeroNota] = useState("");
  const [dataNota, setDataNota] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [descricaoNota, setDescricaoNota] = useState("");
  const [justificativaNota, setJustificativaNota] = useState("");
  const [arquivoNota, setArquivoNota] = useState<File | null>(null);
  const [arquivosComplementares, setArquivosComplementares] = useState<File[]>([]);
  const [valorRecebido, setValorRecebido] = useState("");
  const [valorDespesa, setValorDespesa] = useState("");
  const [notaValorEditando, setNotaValorEditando] = useState<NotaDespesa | null>(null);
  const [valorDespesaEdicao, setValorDespesaEdicao] = useState("");
  const [dialogValorNotaAberto, setDialogValorNotaAberto] = useState(false);
  const [notaExcluindo, setNotaExcluindo] = useState<NotaDespesa | null>(null);
  const [excluindoNota, setExcluindoNota] = useState(false);
  const [gerandoRelatorioNotaId, setGerandoRelatorioNotaId] = useState<string | null>(null);
  const [salvandoValorNota, setSalvandoValorNota] = useState(false);
  const [dialogResumoAberto, setDialogResumoAberto] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [dialogReabrirAberto, setDialogReabrirAberto] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [comprovanteDevolucao, setComprovanteDevolucao] = useState<File | null>(null);
  const [enviandoComprovante, setEnviandoComprovante] = useState(false);
  const [gerandoPrestacao, setGerandoPrestacao] = useState(false);
  const [dialogArquivosPrestacao, setDialogArquivosPrestacao] = useState(false);

  const [dialogEditarProcessoAberto, setDialogEditarProcessoAberto] = useState(false);
  const [salvandoEdicaoProcesso, setSalvandoEdicaoProcesso] = useState(false);
  const [edicaoProcesso1Doc, setEdicaoProcesso1Doc] = useState("");
  const [edicaoDataRecebimento, setEdicaoDataRecebimento] = useState("");
  const [edicaoPeriodoAplicacao, setEdicaoPeriodoAplicacao] = useState("");
  const [edicaoNumeroEmpenho, setEdicaoNumeroEmpenho] = useState("");
  const [edicaoValorRecebido, setEdicaoValorRecebido] = useState("");

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

  const documentosQ = useQuery({
    queryKey: ["adiantamento-nota-documentos", processoSelecionado?.id],
    enabled: !!processoSelecionado?.id,
    queryFn: async () => {
      if (!processoSelecionado?.id) return [];
      const { data, error } = await supabase
        .from("adiantamento_nota_documentos")
        .select("*")
        .eq("adiantamento_id", processoSelecionado.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as DocumentoComplementar[];
    },
  });

  const arquivosPrestacaoQ = useQuery({
    queryKey: ["adiantamento-prestacao-arquivos", processoSelecionado?.id],
    enabled: !!processoSelecionado?.id,
    queryFn: async () => {
      if (!processoSelecionado?.id) return [];
      const { data, error } = await supabase
        .from("adiantamento_prestacao_arquivos")
        .select("*")
        .eq("adiantamento_id", processoSelecionado.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ArquivoPrestacao[];
    },
  });

  const documentosPorNota = useMemo(() => {
    const porNota = new Map<string, DocumentoComplementar[]>();
    for (const documento of documentosQ.data ?? []) {
      const atuais = porNota.get(documento.nota_id) ?? [];
      atuais.push(documento);
      porNota.set(documento.nota_id, atuais);
    }
    return porNota;
  }, [documentosQ.data]);

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
    setValorRecebidoProcesso("");
  }

  function fecharDialogProcesso() {
    if (salvando) return;
    setDialogAberto(false);
    limparFormularioProcesso();
  }

  async function salvarProcesso(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valorRecebidoNovo = lerValorMonetario(valorRecebidoProcesso);
    if (!processo1Doc.trim() || !dataRecebimento || !Number.isInteger(dias) || dias <= 0 || !dataVencimento || !numeroEmpenho.trim() || valorRecebidoNovo === null) {
      toast.error("Preencha todos os campos com informações válidas, incluindo o valor recebido.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from("adiantamentos").insert({
      processo_1doc: processo1Doc.trim(),
      data_recebimento: dataRecebimento,
      periodo_aplicacao_dias: dias,
      data_vencimento: dataVencimento,
      numero_empenho: numeroEmpenho.trim(),
      valor_recebido: valorRecebidoNovo,
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
    setJustificativaNota("");
    setArquivoNota(null);
    setArquivosComplementares([]);
    setValorRecebido("");
    setValorDespesa("");
    if (inputArquivo.current) inputArquivo.current.value = "";
    if (inputDocumentosComplementares.current) inputDocumentosComplementares.current.value = "";
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

  function selecionarDocumentosComplementares(files: FileList | null) {
    if (!files?.length) return;
    const novos = Array.from(files);
    const combinados = [...arquivosComplementares];
    for (const arquivo of novos) {
      const erro = validarDocumentoComplementar(arquivo);
      if (erro) {
        toast.error(erro);
        continue;
      }
      const duplicado = combinados.some((existente) =>
        existente.name === arquivo.name
        && existente.size === arquivo.size
        && existente.lastModified === arquivo.lastModified
      );
      if (!duplicado) combinados.push(arquivo);
    }
    if (combinados.length > LIMITE_DOCUMENTOS_COMPLEMENTARES) {
      toast.error(`É permitido anexar até ${LIMITE_DOCUMENTOS_COMPLEMENTARES} documentos complementares por nota.`);
      return;
    }
    const tamanhoTotal = combinados.reduce((total, arquivo) => total + arquivo.size, 0);
    if (tamanhoTotal > LIMITE_TOTAL_COMPLEMENTARES_BYTES) {
      toast.error("O conjunto de documentos complementares não pode ultrapassar 100 MB.");
      return;
    }
    setArquivosComplementares(combinados);
    if (inputDocumentosComplementares.current) inputDocumentosComplementares.current.value = "";
  }

  function removerDocumentoComplementar(indice: number) {
    setArquivosComplementares((atuais) => atuais.filter((_, i) => i !== indice));
  }

  async function salvarNota(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!processoSelecionado) return;
    const valorDespesaNumerico = lerValorMonetario(valorDespesa);
    if (!numeroNota.trim() || !dataNota || !fornecedor.trim() || !descricaoNota.trim() || !justificativaNota.trim()) {
      toast.error("Preencha o número, data, fornecedor, descrição e justificativa da despesa.");
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
    const caminhosEnviados: string[] = [];
    let notaRegistrada = false;

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
        caminhosEnviados.push(caminhoArquivo);
      }

      const { error } = await supabase.from("adiantamento_notas").insert({
        id: notaId,
        adiantamento_id: processoSelecionado.id,
        numero_nota: numeroNota.trim(),
        data_nota: dataNota,
        fornecedor: fornecedor.trim(),
        descricao: descricaoNota.trim(),
        justificativa: justificativaNota.trim(),
        valor_despesa: valorDespesaNumerico,
        arquivo_nome: arquivoNota?.name ?? null,
        arquivo_caminho: caminhoArquivo,
        arquivo_mime_type: mimeArquivo,
        arquivo_tamanho_bytes: arquivoNota?.size ?? null,
      });
      if (error) throw new Error("Não foi possível registrar a nota: " + error.message);
      notaRegistrada = true;

      if (arquivosComplementares.length > 0) {
        const documentosInserir: Array<{
          id: string;
          adiantamento_id: string;
          nota_id: string;
          arquivo_nome: string;
          arquivo_caminho: string;
          arquivo_mime_type: string;
          arquivo_tamanho_bytes: number;
        }> = [];
        for (const arquivo of arquivosComplementares) {
          const documentoId = crypto.randomUUID();
          const nomeSeguro = arquivo.name.normalize("NFD").replace(/[^\w.\-]+/g, "_");
          const caminho = `adiantamento/${processoSelecionado.id}/${notaId}/complementares/${documentoId}_${nomeSeguro}`;
          const mime = arquivo.type || "application/octet-stream";
          const { error: erroUpload } = await supabase.storage
            .from("anexos")
            .upload(caminho, arquivo, {
              contentType: mime,
              upsert: false,
            });
          if (erroUpload) {
            throw new Error(`Falha ao anexar o documento complementar "${arquivo.name}": ${erroUpload.message}`);
          }
          caminhosEnviados.push(caminho);
          documentosInserir.push({
            id: documentoId,
            adiantamento_id: processoSelecionado.id,
            nota_id: notaId,
            arquivo_nome: arquivo.name,
            arquivo_caminho: caminho,
            arquivo_mime_type: mime,
            arquivo_tamanho_bytes: arquivo.size,
          });
        }

        const { error: erroDocumentos } = await supabase
          .from("adiantamento_nota_documentos")
          .insert(documentosInserir);
        if (erroDocumentos) {
          throw new Error("Não foi possível registrar os documentos complementares: " + erroDocumentos.message);
        }
      }

      toast.success(arquivosComplementares.length > 0
        ? `Nota cadastrada com ${arquivosComplementares.length} documento(s) complementar(es).`
        : "Nota de despesa cadastrada com sucesso.");
      setDialogNotaAberto(false);
      limparFormularioNota();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["adiantamento-notas", processoSelecionado.id] }),
        qc.invalidateQueries({ queryKey: ["adiantamento-nota-documentos", processoSelecionado.id] }),
        qc.invalidateQueries({ queryKey: ["adiantamentos"] }),
      ]);
    } catch (erro) {
      if (caminhosEnviados.length > 0) {
        const { error: erroRemocao } = await supabase.storage.from("anexos").remove(caminhosEnviados);
        if (erroRemocao) console.error("Falha ao remover arquivos após erro no registro:", erroRemocao);
      }
      if (notaRegistrada) {
        const { error: erroNota } = await supabase
          .from("adiantamento_notas")
          .delete()
          .eq("id", notaId);
        if (erroNota) console.error("Falha ao remover nota após erro em documentos complementares:", erroNota);
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

  async function excluirNota() {
    if (!notaExcluindo || !processoSelecionado || excluindoNota) return;
    if (processoSelecionado.finalizado) {
      toast.error("Não é possível excluir notas de um adiantamento finalizado.");
      return;
    }

    setExcluindoNota(true);
    const nota = notaExcluindo;
    const documentos = documentosPorNota.get(nota.id) ?? [];
    const caminhosArquivos = [
      nota.arquivo_caminho,
      ...documentos.map((documento) => documento.arquivo_caminho),
    ].filter((caminho): caminho is string => Boolean(caminho));

    const { error } = await supabase
      .from("adiantamento_notas")
      .delete()
      .eq("id", nota.id)
      .eq("adiantamento_id", processoSelecionado.id);

    if (error) {
      setExcluindoNota(false);
      toast.error("Não foi possível excluir a nota: " + error.message);
      return;
    }

    if (caminhosArquivos.length > 0) {
      const { error: erroArquivos } = await supabase.storage.from("anexos").remove(caminhosArquivos);
      if (erroArquivos) {
        console.error("Nota excluída, mas houve falha ao remover um ou mais anexos:", erroArquivos);
        toast.warning("Nota excluída, mas não foi possível remover todos os arquivos anexados do armazenamento.");
      } else {
        toast.success("Nota e respectivos documentos excluídos com sucesso.");
      }
    } else {
      toast.success("Nota excluída com sucesso.");
    }

    setExcluindoNota(false);
    setNotaExcluindo(null);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["adiantamento-notas", processoSelecionado.id] }),
      qc.invalidateQueries({ queryKey: ["adiantamento-nota-documentos", processoSelecionado.id] }),
    ]);
  }

  async function salvarValorRecebido() {
    if (!processoSelecionado || processoSelecionado.finalizado) return;
    const valor = lerValorMonetario(valorRecebido);
    if (valor === null) {
      toast.error("Informe um valor recebido válido, maior que zero.");
      return;
    }
    const { error } = await supabase
      .from("adiantamentos")
      .update({ valor_recebido: valor })
      .eq("id", processoSelecionado.id);
    if (error) {
      toast.error("Não foi possível salvar o valor recebido: " + error.message);
      return;
    }
    setProcessoSelecionado({ ...processoSelecionado, valor_recebido: valor });
    toast.success("Valor recebido atualizado.");
    await qc.invalidateQueries({ queryKey: ["adiantamentos"] });
  }

  function nomeSeguroArquivo(valor: string): string {
    return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "FORNECEDOR";
  }

  async function salvarComprovanteDevolucao() {
    if (!processoSelecionado?.finalizado || !comprovanteDevolucao || enviandoComprovante) return;
    const ext = comprovanteDevolucao.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = comprovanteDevolucao.type.toLowerCase();
    const permitido = mime === "application/pdf" || ["pdf", "jpg", "jpeg", "png"].includes(ext);
    if (!permitido) {
      toast.error("Anexe o comprovante em PDF, JPG ou PNG.");
      return;
    }
    if (comprovanteDevolucao.size <= 0 || comprovanteDevolucao.size > LIMITE_ARQUIVO_BYTES) {
      toast.error("O comprovante deve ter até 15 MB.");
      return;
    }

    setEnviandoComprovante(true);
    const id = crypto.randomUUID();
    const nome = comprovanteDevolucao.name;
    const caminho = `adiantamento/${processoSelecionado.id}/prestacao/comprovante_devolucao_${id}_${nomeSeguroArquivo(nome)}`;
    const { error: uploadError } = await supabase.storage.from("anexos").upload(caminho, comprovanteDevolucao, {
      contentType: mime || (ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg"),
      upsert: false,
    });
    if (uploadError) {
      setEnviandoComprovante(false);
      toast.error("Não foi possível enviar o comprovante: " + uploadError.message);
      return;
    }

    const { error: insertError } = await supabase.from("adiantamento_prestacao_arquivos").insert({
      adiantamento_id: processoSelecionado.id,
      tipo: "comprovante_devolucao",
      arquivo_nome: nome,
      arquivo_caminho: caminho,
      arquivo_mime_type: mime || (ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg"),
      arquivo_tamanho_bytes: comprovanteDevolucao.size,
    });
    if (insertError) {
      await supabase.storage.from("anexos").remove([caminho]);
      setEnviandoComprovante(false);
      toast.error("O arquivo foi enviado, mas não foi possível registrar o comprovante: " + insertError.message);
      return;
    }

    setComprovanteDevolucao(null);
    if (inputComprovanteDevolucao.current) inputComprovanteDevolucao.current.value = "";
    setEnviandoComprovante(false);
    toast.success("Comprovante de devolução anexado. Agora você pode gerar a prestação de contas.");
    await arquivosPrestacaoQ.refetch();
  }

  async function gerarPrestacaoContas(processoInformado?: Adiantamento) {
    const processoGeracao = processoInformado ?? processoSelecionado;
    if (!processoGeracao?.finalizado || gerandoPrestacao) return;
    setGerandoPrestacao(true);
    const caminhosEnviados: string[] = [];
    try {
      const [notasResult, docsResult, arquivosResult] = await Promise.all([
        notasQ.refetch(),
        documentosQ.refetch(),
        arquivosPrestacaoQ.refetch(),
      ]);
      if (notasResult.error) throw notasResult.error;
      if (docsResult.error) throw docsResult.error;
      if (arquivosResult.error) throw arquivosResult.error;
      const notasAtuais = notasResult.data ?? [];
      const docsAtuais = docsResult.data ?? [];
      const arquivosAtuais = arquivosResult.data ?? [];
      const totalDespesas = notasAtuais.reduce((sum, nota) => sum + (Number(nota.valor_despesa) || 0), 0);
      const recebido = Number(processoGeracao.valor_recebido) || 0;
      const saldo = Math.round((recebido - totalDespesas) * 100) / 100;
      const comprovante = arquivosAtuais.find((item) => item.tipo === "comprovante_devolucao");
      if (saldo > 0 && !comprovante) {
        throw new Error(`É obrigatório anexar o comprovante da devolução de ${moedaBRL(saldo)} ao Fundo Municipal de Saúde antes de gerar a prestação de contas.`);
      }
      if (arquivosAtuais.some((item) => item.tipo === "pacote_zip")) {
        toast.info("Os arquivos desta prestação de contas já foram gerados. Consulte Arquivos da prestação de contas.");
        setGerandoPrestacao(false);
        return;
      }

      const baixarAnexo = async (caminho: string, nome: string, mimeType: string, categoria: "nota" | "complementar"): Promise<AnexoRelatorio> => {
        const { data, error } = await supabase.storage.from("anexos").createSignedUrl(caminho, 300);
        if (error || !data?.signedUrl) throw new Error(`Não foi possível acessar o arquivo "${nome}".`);
        const resposta = await fetch(data.signedUrl);
        if (!resposta.ok) throw new Error(`Falha ao baixar "${nome}" para montar o relatório.`);
        let bytes = new Uint8Array(await resposta.arrayBuffer());
        let mimeFinal = (mimeType || "").toLowerCase();
        let nomeFinal = nome;
        if (mimeFinal.startsWith("image/") && !["image/jpeg", "image/jpg", "image/png"].includes(mimeFinal)) {
          try {
            const imagem = await createImageBitmap(new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: mimeFinal }));
            const canvas = document.createElement("canvas");
            canvas.width = imagem.width;
            canvas.height = imagem.height;
            const contexto = canvas.getContext("2d");
            if (!contexto) throw new Error("Não foi possível preparar a imagem.");
            contexto.drawImage(imagem, 0, 0);
            imagem.close();
            const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao converter imagem.")), "image/png"));
            bytes = new Uint8Array(await png.arrayBuffer());
            mimeFinal = "image/png";
            nomeFinal = nome.replace(/\.[^.]+$/, "") + ".png";
          } catch {
            throw new Error(`A imagem "${nome}" não pôde ser convertida. Converta-a para JPG ou PNG e anexe novamente.`);
          }
        }
        if (!(mimeFinal === "application/pdf" || mimeFinal === "image/jpeg" || mimeFinal === "image/jpg" || mimeFinal === "image/png" || /\.(pdf|jpe?g|png)$/i.test(nomeFinal))) {
          throw new Error(`O documento complementar "${nome}" precisa ser convertido para PDF, JPG ou PNG antes de gerar os arquivos finais.`);
        }
        return { nome: nomeFinal, mimeType: mimeFinal, bytes, categoria };
      };

      const entries: Array<{ name: string; bytes: Uint8Array }> = [];
      const registros: Array<{
        adiantamento_id: string;
        nota_id?: string;
        tipo: string;
        arquivo_nome: string;
        arquivo_caminho: string;
        arquivo_mime_type: string;
        arquivo_tamanho_bytes: number;
      }> = [];
      const geracaoId = crypto.randomUUID();
      const nomeProcesso = nomeSeguroArquivo(processoGeracao.processo_1doc);

      const enviarPdf = async (nome: string, bytes: Uint8Array, tipo: string, notaId?: string) => {
        const caminho = `adiantamento/${processoGeracao.id}/prestacao/${geracaoId}/${nome}`;
        const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "application/pdf" });
        const { error } = await supabase.storage.from("anexos").upload(caminho, blob, { contentType: "application/pdf", upsert: false });
        if (error) throw new Error(`Falha ao armazenar ${nome}: ${error.message}`);
        caminhosEnviados.push(caminho);
        registros.push({
          adiantamento_id: processoGeracao.id,
          ...(notaId ? { nota_id: notaId } : {}),
          tipo,
          arquivo_nome: nome,
          arquivo_caminho: caminho,
          arquivo_mime_type: "application/pdf",
          arquivo_tamanho_bytes: bytes.byteLength,
        });
        entries.push({ name: nome, bytes });
      };

      for (let index = 0; index < notasAtuais.length; index++) {
        const nota = notasAtuais[index];
        const anexos: AnexoRelatorio[] = [];
        if (nota.arquivo_caminho && nota.arquivo_nome) {
          anexos.push(await baixarAnexo(nota.arquivo_caminho, nota.arquivo_nome, nota.arquivo_mime_type ?? "", "nota"));
        }
        for (const documento of docsAtuais.filter((doc) => doc.nota_id === nota.id)) {
          anexos.push(await baixarAnexo(documento.arquivo_caminho, documento.arquivo_nome, documento.arquivo_mime_type, "complementar"));
        }
        const pdf = await gerarRelatorioAdiantamento({
          processo: {
            processo_1doc: processoGeracao.processo_1doc,
            numero_empenho: processoGeracao.numero_empenho,
            data_recebimento: processoGeracao.data_recebimento,
            periodo_aplicacao_dias: processoGeracao.periodo_aplicacao_dias,
            data_vencimento: processoGeracao.data_vencimento,
            valor_recebido: processoGeracao.valor_recebido,
          },
          nota: {
            numero_nota: nota.numero_nota,
            data_nota: nota.data_nota,
            fornecedor: nota.fornecedor,
            descricao: nota.descricao,
            justificativa: nota.justificativa || "",
            valor_despesa: nota.valor_despesa,
          },
          totalDespesas,
          anexos,
        });
        const nomeNota = `${String(index + 1).padStart(2, "0")} - ${nomeSeguroArquivo(nota.fornecedor).toUpperCase()}.pdf`;
        await enviarPdf(nomeNota, pdf, "relatorio_nota", nota.id);
      }

      const anexoII = await gerarAnexoIIDespesas({
        processo_1doc: processoGeracao.processo_1doc,
        numero_empenho: processoGeracao.numero_empenho,
        data_recebimento: processoGeracao.data_recebimento,
        data_vencimento: processoGeracao.data_vencimento,
        valor_recebido: recebido,
        despesas: notasAtuais.map((nota, index) => ({
          numero: index + 1,
          numero_nota: nota.numero_nota,
          data_nota: nota.data_nota,
          fornecedor: nota.fornecedor,
          descricao: nota.descricao,
          valor_despesa: Number(nota.valor_despesa) || 0,
        })),
      });
      await enviarPdf("ANEXO II - RELATORIO DE DESPESAS.pdf", anexoII, "anexo_ii");

      if (saldo > 0) {
        if (!comprovante) throw new Error("Comprovante de devolução não localizado.");
        const { data: signed, error } = await supabase.storage.from("anexos").createSignedUrl(comprovante.arquivo_caminho, 300);
        if (error || !signed?.signedUrl) throw new Error("Não foi possível acessar o comprovante de devolução.");
        const response = await fetch(signed.signedUrl);
        if (!response.ok) throw new Error("Falha ao baixar o comprovante de devolução.");
        const proofBytes = new Uint8Array(await response.arrayBuffer());
        const deposito = await gerarDepositoSaldoRemanescente({
          processo_1doc: processoGeracao.processo_1doc,
          numero_empenho: processoGeracao.numero_empenho,
          data_devolucao: new Date().toISOString().slice(0, 10),
          valor_devolvido: saldo,
        }, {
          nome: comprovante.arquivo_nome,
          mimeType: comprovante.arquivo_mime_type,
          bytes: proofBytes,
        });
        await enviarPdf("DEPOSITO DE SALDO REMANESCENTE.pdf", deposito, "deposito_saldo");
      }

      const zipBytes = criarArquivoZip(entries);
      const zipName = `PRESTACAO DE CONTAS - PROCESSO ${nomeProcesso}.zip`;
      const zipPath = `adiantamento/${processoGeracao.id}/prestacao/${geracaoId}/${zipName}`;
      const zipBlob = new Blob([zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer], { type: "application/zip" });
      const { error: zipError } = await supabase.storage.from("anexos").upload(zipPath, zipBlob, { contentType: "application/zip", upsert: false });
      if (zipError) throw new Error("Não foi possível armazenar o arquivo ZIP: " + zipError.message);
      caminhosEnviados.push(zipPath);
      registros.push({
        adiantamento_id: processoGeracao.id,
        tipo: "pacote_zip",
        arquivo_nome: zipName,
        arquivo_caminho: zipPath,
        arquivo_mime_type: "application/zip",
        arquivo_tamanho_bytes: zipBytes.byteLength,
      });

      const { error: metadataError } = await supabase.from("adiantamento_prestacao_arquivos").insert(registros);
      if (metadataError) throw new Error("Os arquivos foram preparados, mas não foi possível registrar a prestação de contas: " + metadataError.message);

      toast.success("Prestação de contas gerada. O ZIP contém o ANEXO II e os relatórios individuais das notas.");
      await arquivosPrestacaoQ.refetch();
      setDialogArquivosPrestacao(true);
    } catch (error) {
      if (caminhosEnviados.length) {
        const { error: cleanupError } = await supabase.storage.from("anexos").remove(caminhosEnviados);
        if (cleanupError) console.error("Falha ao limpar arquivos de uma geração incompleta:", cleanupError);
      }
      console.error("Erro ao gerar prestação de contas:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a prestação de contas.");
    } finally {
      setGerandoPrestacao(false);
    }
  }

  async function baixarArquivoPrestacao(arquivo: ArquivoPrestacao) {
    const { data, error } = await supabase.storage.from("anexos").createSignedUrl(arquivo.arquivo_caminho, 300);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível acessar o arquivo da prestação de contas.");
      return;
    }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = arquivo.arquivo_nome;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function confirmarFinalizacao() {
    if (!processoSelecionado || finalizando) return;
    // Confere previamente se todos os anexos podem ser incorporados aos PDFs,
    // evitando bloquear o processo com arquivos Word/Excel/PowerPoint não conversíveis no navegador.
    const [notasParaConferir, docsParaConferir] = await Promise.all([notasQ.refetch(), documentosQ.refetch()]);
    if (notasParaConferir.error || docsParaConferir.error) {
      toast.error("Não foi possível conferir os anexos das notas antes da finalização.");
      return;
    }
    const anexosParaConferir = [
      ...(notasParaConferir.data ?? []).filter((nota) => nota.arquivo_caminho).map((nota) => ({
        nome: nota.arquivo_nome ?? "nota fiscal",
        mime: nota.arquivo_mime_type ?? "",
      })),
      ...(docsParaConferir.data ?? []).map((doc) => ({ nome: doc.arquivo_nome, mime: doc.arquivo_mime_type })),
    ];
    const anexosNaoConversiveis = anexosParaConferir.filter((arquivo) => {
      const ext = arquivo.nome.split(".").pop()?.toLowerCase() ?? "";
      const mime = arquivo.mime.toLowerCase();
      return !(mime === "application/pdf" || mime.startsWith("image/") || ["pdf", "jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"].includes(ext));
    });
    if (anexosNaoConversiveis.length > 0) {
      toast.error(`Converta os seguintes documentos para PDF ou imagem antes de finalizar: ${anexosNaoConversiveis.map((item) => item.nome).join(", ")}.`);
      return;
    }

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
      valor_devolucao?: number;
    };
    // Reconsulta o registro persistido para que a tela use o valor recebido e o
    // status efetivamente gravados no banco, não uma cópia antiga do modal.
    const { data: adiantamentoAtual, error: erroReconsulta } = await supabase
      .from("adiantamentos")
      .select("*")
      .eq("id", processoSelecionado.id)
      .single();
    if (erroReconsulta) {
      console.error("Não foi possível atualizar os dados do adiantamento após a confirmação:", erroReconsulta);
    }

    const processoFinalizado: Adiantamento = {
      ...processoSelecionado,
      ...(adiantamentoAtual ?? {}),
      finalizado: true,
      finalizado_em: adiantamentoAtual?.finalizado_em ?? resultado.finalizado_em ?? new Date().toISOString(),
    };

    // Usa os dados recém-consultados e calcula em centavos. Não usa
    // resultado.valor_devolucao da RPC, pois versões antigas da função podem
    // devolver zero ou um campo desatualizado e pular a etapa de comprovante.
    const totalDespesasConfirmadas = (notasParaConferir.data ?? []).reduce(
      (total, nota) => total + Math.round((Number(nota.valor_despesa) || 0) * 100),
      0,
    );
    const recebidoEmCentavos = Math.round((Number(processoFinalizado.valor_recebido) || 0) * 100);
    const saldoDevolucao = Math.max(0, (recebidoEmCentavos - totalDespesasConfirmadas) / 100);

    setProcessoSelecionado(processoFinalizado);
    setDialogResumoAberto(false);

    await Promise.all([
      qc.invalidateQueries({ queryKey: ["adiantamentos"] }),
      qc.invalidateQueries({ queryKey: ["adiantamento-notas", processoSelecionado.id] }),
      arquivosPrestacaoQ.refetch(),
    ]);

    if (saldoDevolucao > 0) {
      toast.warning(`Adiantamento finalizado. Etapa de devolução aberta: deverá ser transferido ${moedaBRL(saldoDevolucao)} ao Fundo Municipal de Saúde. Anexe o comprovante nesta tela para liberar a geração do depósito, do ANEXO II, dos relatórios individuais e do ZIP.`);
    } else {
      toast.success("Adiantamento confirmado. Iniciando automaticamente a geração dos PDFs e do arquivo ZIP.");
      await gerarPrestacaoContas(processoFinalizado);
    }
  }

  async function confirmarReabertura() {
    if (!processoSelecionado || reabrindo) return;
    setReabrindo(true);
    const { error } = await supabase.rpc("reabrir_adiantamento", {
      p_adiantamento_id: processoSelecionado.id,
    });
    setReabrindo(false);
    if (error) {
      toast.error("Não foi possível abrir o adiantamento para ajustes: " + error.message);
      return;
    }
    // Os documentos gerados representam a versão anterior da prestação.
    // Ao reabrir, remove os arquivos finais e o comprovante para exigir nova conferência.
    const arquivosAntigos = await supabase
      .from("adiantamento_prestacao_arquivos")
      .select("id, arquivo_caminho")
      .eq("adiantamento_id", processoSelecionado.id);
    if (!arquivosAntigos.error && (arquivosAntigos.data?.length ?? 0) > 0) {
      const caminhosAntigos = arquivosAntigos.data.map((item) => item.arquivo_caminho);
      const { error: erroStorage } = await supabase.storage.from("anexos").remove(caminhosAntigos);
      if (erroStorage) console.error("Falha ao remover arquivos antigos da prestação:", erroStorage);
      const { error: erroMetadados } = await supabase
        .from("adiantamento_prestacao_arquivos")
        .delete()
        .eq("adiantamento_id", processoSelecionado.id);
      if (erroMetadados) console.error("Falha ao invalidar registros antigos da prestação:", erroMetadados);
    }
    setComprovanteDevolucao(null);
    if (inputComprovanteDevolucao.current) inputComprovanteDevolucao.current.value = "";
    setProcessoSelecionado({
      ...processoSelecionado,
      finalizado: false,
      finalizado_em: null,
    });
    setDialogReabrirAberto(false);
    setDialogResumoAberto(false);
    toast.success("Adiantamento reaberto. Os dados e as notas foram preservados e já podem ser ajustados.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["adiantamentos"] }),
      qc.invalidateQueries({ queryKey: ["adiantamento-notas", processoSelecionado.id] }),
    ]);
  }

  function abrirEdicaoProcesso() {
    if (!processoSelecionado || processoSelecionado.finalizado) return;
    setEdicaoProcesso1Doc(processoSelecionado.processo_1doc);
    setEdicaoDataRecebimento(processoSelecionado.data_recebimento);
    setEdicaoPeriodoAplicacao(String(processoSelecionado.periodo_aplicacao_dias));
    setEdicaoNumeroEmpenho(processoSelecionado.numero_empenho);
    setEdicaoValorRecebido(valorParaInput(processoSelecionado.valor_recebido));
    setDialogEditarProcessoAberto(true);
  }

  async function salvarEdicaoProcesso(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!processoSelecionado || processoSelecionado.finalizado || salvandoEdicaoProcesso) return;
    const periodo = Number(edicaoPeriodoAplicacao);
    const vencimento = somarDias(edicaoDataRecebimento, periodo);
    const valor = lerValorMonetario(edicaoValorRecebido);
    if (!edicaoProcesso1Doc.trim() || !edicaoDataRecebimento
      || !Number.isInteger(periodo) || periodo <= 0 || !vencimento
      || !edicaoNumeroEmpenho.trim() || valor === null) {
      toast.error("Preencha todos os dados do processo com valores válidos.");
      return;
    }

    setSalvandoEdicaoProcesso(true);
    const { error } = await supabase
      .from("adiantamentos")
      .update({
        processo_1doc: edicaoProcesso1Doc.trim(),
        data_recebimento: edicaoDataRecebimento,
        periodo_aplicacao_dias: periodo,
        data_vencimento: vencimento,
        numero_empenho: edicaoNumeroEmpenho.trim(),
        valor_recebido: valor,
      })
      .eq("id", processoSelecionado.id);
    setSalvandoEdicaoProcesso(false);

    if (error) {
      toast.error("Não foi possível salvar os ajustes: " + error.message);
      return;
    }

    setProcessoSelecionado({
      ...processoSelecionado,
      processo_1doc: edicaoProcesso1Doc.trim(),
      data_recebimento: edicaoDataRecebimento,
      periodo_aplicacao_dias: periodo,
      data_vencimento: vencimento,
      numero_empenho: edicaoNumeroEmpenho.trim(),
      valor_recebido: valor,
    });
    setDialogEditarProcessoAberto(false);
    toast.success("Dados do adiantamento atualizados.");
    await qc.invalidateQueries({ queryKey: ["adiantamentos"] });
  }

  async function gerarRelatorioNota(nota: NotaDespesa) {
    if (!processoSelecionado || gerandoRelatorioNotaId) return;
    setGerandoRelatorioNotaId(nota.id);
    try {
      const documentosAtualizados = await documentosQ.refetch();
      if (documentosAtualizados.error) throw documentosAtualizados.error;

      const anexos: AnexoRelatorio[] = [];
      const baixarArquivo = async (caminho: string, nome: string, mimeType: string, categoria: "nota" | "complementar") => {
        const { data, error } = await supabase.storage.from("anexos").createSignedUrl(caminho, 300);
        if (error || !data?.signedUrl) throw new Error(`Não foi possível acessar o arquivo "${nome}".`);
        const resposta = await fetch(data.signedUrl);
        if (!resposta.ok) throw new Error(`Falha ao baixar "${nome}" para montar o relatório.`);
        let bytes = new Uint8Array(await resposta.arrayBuffer());
        let mimeFinal = mimeType || "application/octet-stream";
        let nomeFinal = nome;

        if (mimeFinal.startsWith("image/") && !["image/jpeg", "image/jpg", "image/png"].includes(mimeFinal)) {
          try {
            const imagem = await createImageBitmap(new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: mimeFinal }));
            const canvas = document.createElement("canvas");
            canvas.width = imagem.width;
            canvas.height = imagem.height;
            const contexto = canvas.getContext("2d");
            if (!contexto) throw new Error("Não foi possível preparar a imagem.");
            contexto.drawImage(imagem, 0, 0);
            imagem.close();
            const png = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao converter imagem.")), "image/png");
            });
            bytes = new Uint8Array(await png.arrayBuffer());
            mimeFinal = "image/png";
            nomeFinal = nome.replace(/\.[^.]+$/, "") + ".png";
          } catch {
            throw new Error(`A imagem "${nome}" não pôde ser convertida. Converta-a para JPG ou PNG e anexe novamente.`);
          }
        }

        anexos.push({ nome: nomeFinal, mimeType: mimeFinal, bytes, categoria });
      };

      if (nota.arquivo_caminho && nota.arquivo_nome) {
        await baixarArquivo(
          nota.arquivo_caminho,
          nota.arquivo_nome,
          nota.arquivo_mime_type ?? "",
          "nota",
        );
      }

      for (const documento of documentosAtualizados.data ?? []) {
        if (documento.nota_id !== nota.id) continue;
        await baixarArquivo(
          documento.arquivo_caminho,
          documento.arquivo_nome,
          documento.arquivo_mime_type,
          "complementar",
        );
      }

      const notasAtualizadas = await notasQ.refetch();
      if (notasAtualizadas.error) throw notasAtualizadas.error;
      const totalDespesas = (notasAtualizadas.data ?? []).reduce(
        (total, item) => total + (Number(item.valor_despesa) || 0),
        0,
      );

      const pdfBytes = await gerarRelatorioAdiantamento({
        processo: {
          processo_1doc: processoSelecionado.processo_1doc,
          numero_empenho: processoSelecionado.numero_empenho,
          data_recebimento: processoSelecionado.data_recebimento,
          periodo_aplicacao_dias: processoSelecionado.periodo_aplicacao_dias,
          data_vencimento: processoSelecionado.data_vencimento,
          valor_recebido: processoSelecionado.valor_recebido,
        },
        nota: {
          numero_nota: nota.numero_nota,
          data_nota: nota.data_nota,
          fornecedor: nota.fornecedor,
          descricao: nota.descricao,
          justificativa: nota.justificativa || "",
          valor_despesa: nota.valor_despesa,
        },
        totalDespesas,
        anexos,
      });

      const blob = new Blob([pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const nomeProcesso = processoSelecionado.processo_1doc.replace(/[^\w.-]+/g, "_");
      const nomeNota = nota.numero_nota.replace(/[^\w.-]+/g, "_");
      link.href = url;
      link.download = `Prestacao_Contas_Adiantamento_${nomeProcesso}_Nota_${nomeNota}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success("Relatório PDF gerado com sucesso.");
    } catch (erro) {
      console.error("Erro ao gerar relatório de prestação de contas:", erro);
      toast.error(erro instanceof Error ? erro.message : "Não foi possível gerar o relatório PDF.");
    } finally {
      setGerandoRelatorioNotaId(null);
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
    const arquivosPrestacao = arquivosPrestacaoQ.data ?? [];
    const comprovanteSalvo = arquivosPrestacao.find((arquivo) => arquivo.tipo === "comprovante_devolucao");
    const prestacaoGerada = arquivosPrestacao.some((arquivo) => arquivo.tipo === "pacote_zip");
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
              {processoSelecionado.finalizado ? (
                <Badge className="self-center"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Finalizado</Badge>
              ) : (
                <Button variant="outline" onClick={abrirEdicaoProcesso}>
                  <Settings2 className="h-4 w-4" /> Editar dados do processo
                </Button>
              )}
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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">Data do recebimento</div><div className="mt-2 text-lg font-semibold tabular-nums">{dataBR(processoSelecionado.data_recebimento)}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">Período de aplicação</div><div className="mt-2 text-lg font-semibold tabular-nums">{processoSelecionado.periodo_aplicacao_dias} dia(s)</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">Data do vencimento</div><div className="mt-2 flex items-center gap-2 text-lg font-semibold tabular-nums">{dataBR(processoSelecionado.data_vencimento)}{vencido && <Badge variant="destructive">Vencido</Badge>}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">Notas cadastradas</div><div className="mt-2 text-lg font-semibold tabular-nums">{notas.length}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">Valor recebido</div><div className="mt-2 text-lg font-semibold tabular-nums">{moedaBRL(processoSelecionado.valor_recebido)}</div></div>
        </div>

        {processoSelecionado.finalizado && (
          <div className="space-y-3 rounded-xl border bg-card p-4">
            {valorDevolucao !== null && valorDevolucao > 0 ? (
              <>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <h3 className="font-semibold">Devolução de saldo ao Fundo Municipal de Saúde</h3>
                    <p className="mt-1 text-sm">Deverá ser devolvido o valor de <strong>{moedaBRL(valorDevolucao)}</strong> ao Fundo Municipal de Saúde.</p>
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 p-3 text-sm">
                  <div className="font-semibold">Dados para transferência</div>
                  <div>Banco do Brasil</div>
                  <div>Favorecido: Fundo Municipal de Saúde</div>
                  <div>Agência: 4671-0</div>
                  <div>Conta corrente: 9803-5</div>
                </div>
                {comprovanteSalvo ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Comprovante anexado: {comprovanteSalvo.arquivo_nome}</span>
                    {!prestacaoGerada && (
                      <Button onClick={() => void gerarPrestacaoContas()} disabled={gerandoPrestacao}>
                        <FileText className="h-4 w-4" /> {gerandoPrestacao ? "Gerando arquivos..." : "Gerar prestação de contas"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Anexe a imagem ou PDF do comprovante de transferência. Esse documento é obrigatório para gerar o depósito de saldo remanescente e concluir os arquivos da prestação.</p>
                    <input
                      ref={inputComprovanteDevolucao}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      onChange={(event) => setComprovanteDevolucao(event.target.files?.[0] ?? null)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => inputComprovanteDevolucao.current?.click()} disabled={enviandoComprovante}>
                        <Upload className="h-4 w-4" /> Selecionar comprovante
                      </Button>
                      {comprovanteDevolucao && <span className="text-sm text-muted-foreground">{comprovanteDevolucao.name}</span>}
                      <Button type="button" onClick={() => void salvarComprovanteDevolucao()} disabled={!comprovanteDevolucao || enviandoComprovante}>
                        {enviandoComprovante ? "Enviando..." : "Anexar comprovante"}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Prestação de contas confirmada</h3>
                  <p className="text-sm text-muted-foreground">Não há saldo a devolver. Gere os relatórios e o arquivo ZIP para arquivamento.</p>
                </div>
                {!prestacaoGerada && (
                  <Button onClick={() => void gerarPrestacaoContas()} disabled={gerandoPrestacao}>
                    <FileText className="h-4 w-4" /> {gerandoPrestacao ? "Gerando arquivos..." : "Gerar prestação de contas"}
                  </Button>
                )}
              </div>
            )}
            {prestacaoGerada && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <span className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4 text-primary" /> Arquivos da prestação de contas disponíveis.</span>
                <Button onClick={() => setDialogArquivosPrestacao(true)}>
                  <Archive className="h-4 w-4" /> Arquivos da prestação de contas
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Notas de despesas</h3>
            <p className="text-sm text-muted-foreground">Cadastre as notas fiscais e os respectivos comprovantes das despesas deste adiantamento.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void notasQ.refetch()} disabled={notasQ.isFetching}>
              <RefreshCw className="h-4 w-4" /> Atualizar notas
            </Button>
            <Button
              variant={processoSelecionado.finalizado ? "outline" : "destructive"}
              onClick={() => {
                setValorRecebido(valorParaInput(processoSelecionado.valor_recebido));
                setDialogResumoAberto(true);
              }}
              disabled={notasQ.isLoading || notasQ.isError}
            >
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
              {notas.map((nota, indice) => {
                const docsDaNota = documentosPorNota.get(nota.id) ?? [];
                return (
                <li key={nota.id} className="relative flex flex-col gap-2 px-3 py-2.5 pr-28 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums text-foreground">
                      {indice + 1}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold leading-5">Nota nº {nota.numero_nota}</span>
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] leading-4">{dataBR(nota.data_nota)}</Badge>
                    </div>
                    <div className="text-xs font-semibold leading-4">{nota.fornecedor}</div>
                    <p className="text-xs leading-4 text-muted-foreground">{nota.descricao}</p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-xs font-semibold tabular-nums">
                        {nota.valor_despesa === null ? "Valor não informado" : moedaBRL(nota.valor_despesa)}
                      </span>
                      {!processoSelecionado.finalizado && (
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => abrirEdicaoValorNota(nota)}>
                          <Pencil className="mr-1 h-3 w-3" /> {nota.valor_despesa === null ? "Informar valor" : "Ajustar valor"}
                        </Button>
                      )}
                    </div>
                    {nota.arquivo_nome ? (
                      <button type="button" className="inline-flex max-w-full items-center gap-1.5 text-xs text-primary hover:underline" onClick={() => void abrirArquivo(nota.arquivo_caminho!)}>
                        <Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{nota.arquivo_nome}</span>
                        {nota.arquivo_tamanho_bytes ? <span className="shrink-0 text-xs text-muted-foreground">({tamanhoArquivo(nota.arquivo_tamanho_bytes)})</span> : null}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3.5 w-3.5" /> Sem arquivo anexado</span>
                    )}
                    {docsDaNota.length > 0 && (
                      <div className="mt-1.5 space-y-1 rounded-lg bg-muted/30 p-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                          <Files className="h-3.5 w-3.5" /> Documentos complementares ({docsDaNota.length})
                        </div>
                        <ul className="space-y-1">
                          {docsDaNota.map((documento) => (
                            <li key={documento.id}>
                              <button
                                type="button"
                                className="inline-flex max-w-full items-center gap-2 text-xs text-primary hover:underline"
                                onClick={() => void abrirArquivo(documento.arquivo_caminho)}
                              >
                                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{documento.arquivo_nome}</span>
                                <span className="shrink-0 text-muted-foreground">({tamanhoArquivo(documento.arquivo_tamanho_bytes)})</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {documentosQ.isError && (
                      <p className="text-xs text-destructive">Não foi possível carregar os documentos complementares.</p>
                    )}
                    </div>
                  </div>
                  <div className="absolute right-3 top-2.5 flex flex-col items-end gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-6 gap-1 rounded-full px-2.5 text-[11px]"
                      onClick={() => void gerarRelatorioNota(nota)}
                      disabled={gerandoRelatorioNotaId !== null}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {gerandoRelatorioNotaId === nota.id ? "Gerando..." : "PDF"}
                    </Button>
                    {!processoSelecionado.finalizado && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 rounded-lg px-2 text-[11px] font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setNotaExcluindo(nota)}
                        aria-label={`Excluir nota nº ${nota.numero_nota}`}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir nota
                      </Button>
                    )}
                  </div>
                </li>
                );
              })}
            </ol>
          </div>
        )}

        <Dialog open={dialogArquivosPrestacao} onOpenChange={setDialogArquivosPrestacao}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Archive className="h-5 w-5" /> Arquivos da prestação de contas</DialogTitle>
              <DialogDescription>
                Processo {processoSelecionado.processo_1doc} · Empenho nº {processoSelecionado.numero_empenho}. Todos os documentos finais ficam disponíveis para consulta e download.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {arquivosPrestacao.length === 0 ? (
                <p className="rounded-lg border p-4 text-sm text-muted-foreground">Nenhum arquivo foi gerado ainda.</p>
              ) : (
                arquivosPrestacao.map((arquivo) => (
                  <div key={arquivo.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{arquivo.arquivo_nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {arquivo.tipo === "pacote_zip" ? "Pacote completo ZIP"
                            : arquivo.tipo === "anexo_ii" ? "ANEXO II – Relatório de despesas"
                            : arquivo.tipo === "deposito_saldo" ? "Depósito de saldo remanescente"
                            : arquivo.tipo === "comprovante_devolucao" ? "Comprovante de transferência"
                            : "Relatório individual da nota fiscal"}
                          {" · "}{tamanhoArquivo(arquivo.arquivo_tamanho_bytes)}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void baixarArquivoPrestacao(arquivo)}>
                      <Download className="h-4 w-4" /> Baixar
                    </Button>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogArquivosPrestacao(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!notaExcluindo} onOpenChange={(aberto) => {
          if (!aberto && !excluindoNota) setNotaExcluindo(null);
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" /> Excluir nota de despesa?
              </DialogTitle>
              <DialogDescription>
                Confirme a exclusão da nota nº {notaExcluindo?.numero_nota ?? ""} — {notaExcluindo?.fornecedor ?? ""}.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              Esta ação excluirá permanentemente o cadastro da nota fiscal e seus documentos complementares. Os arquivos anexados também serão removidos do armazenamento.
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNotaExcluindo(null)} disabled={excluindoNota}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" onClick={() => void excluirNota()} disabled={excluindoNota}>
                <Trash2 className="h-4 w-4" /> {excluindoNota ? "Excluindo..." : "Sim, excluir nota"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                <div className="space-y-1.5">
                  <Label htmlFor="nota-valor-despesa">Valor da despesa (R$) *</Label>
                  <Input id="nota-valor-despesa" type="text" inputMode="decimal" value={valorDespesa} onChange={(e) => setValorDespesa(e.target.value)} placeholder="Ex.: 250,00" required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="nota-descricao">Descrição sucinta da despesa (título) *</Label>
                  <Input id="nota-descricao" value={descricaoNota} onChange={(e) => setDescricaoNota(e.target.value)} placeholder="Ex.: GARRAFAS PLÁSTICAS" maxLength={180} required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="nota-justificativa">Justificativa da despesa *</Label>
                  <Textarea id="nota-justificativa" value={justificativaNota} onChange={(e) => setJustificativaNota(e.target.value)} placeholder="Informe a finalidade da aquisição/serviço e sua necessidade para a Administração..." rows={4} maxLength={4000} required />
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
                  <input
                    ref={inputDocumentosComplementares}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
                    onChange={(e) => selecionarDocumentosComplementares(e.target.files)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => inputArquivo.current?.click()} disabled={salvandoNota}>
                      <Upload className="h-4 w-4" /> Anexar arquivo
                    </Button>
                    <Button type="button" variant="outline" onClick={() => inputDocumentosComplementares.current?.click()} disabled={salvandoNota}>
                      <Files className="h-4 w-4" /> Documentos complementares
                      {arquivosComplementares.length > 0 ? ` (${arquivosComplementares.length})` : ""}
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
                  {arquivosComplementares.length > 0 ? (
                    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                      <div className="text-xs font-semibold text-muted-foreground">
                        Documentos complementares selecionados ({arquivosComplementares.length})
                      </div>
                      <ul className="space-y-2">
                        {arquivosComplementares.map((arquivo, indice) => (
                          <li key={`${arquivo.name}-${arquivo.lastModified}-${indice}`} className="flex min-w-0 items-center gap-2 text-sm">
                            <Files className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{tamanhoArquivo(arquivo.size)}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Remover ${arquivo.name}`} onClick={() => removerDocumentoComplementar(indice)} disabled={salvandoNota}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Use este botão para anexar vários documentos de apoio, como listas de presença, certificados, comprovantes e relatórios. São aceitos PDF, imagens, Word, Excel, PowerPoint e TXT, até 15 MB por arquivo (máximo de 20 arquivos e 100 MB por nota).</p>
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

        <Dialog open={dialogValorNotaAberto} onOpenChange={(aberto) => {
          if (!aberto && !salvandoValorNota) {
            setDialogValorNotaAberto(false);
            setNotaValorEditando(null);
            setValorDespesaEdicao("");
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Informar valor da despesa</DialogTitle>
              <DialogDescription>
                Nota nº {notaValorEditando?.numero_nota}. Informe ou corrija o valor para que o resumo financeiro seja calculado corretamente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="nota-valor-edicao">Valor da despesa (R$) *</Label>
              <Input id="nota-valor-edicao" type="text" inputMode="decimal" value={valorDespesaEdicao} onChange={(e) => setValorDespesaEdicao(e.target.value)} placeholder="Ex.: 250,00" disabled={salvandoValorNota} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={salvandoValorNota} onClick={() => {
                setDialogValorNotaAberto(false);
                setNotaValorEditando(null);
              }}>Cancelar</Button>
              <Button type="button" disabled={salvandoValorNota} onClick={() => void salvarValorNota()}>
                {salvandoValorNota ? "Salvando..." : "Salvar valor"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogResumoAberto} onOpenChange={setDialogResumoAberto}>
          <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" /> Resumo de execução financeira
              </DialogTitle>
              <DialogDescription>
                Processo {processoSelecionado.processo_1doc} · Empenho nº {processoSelecionado.numero_empenho}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Valor do adiantamento recebido</div>
                    <div className="mt-1 text-2xl font-bold tabular-nums">{moedaBRL(valorRecebidoAtual)}</div>
                  </div>
                  {!processoSelecionado.finalizado && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="resumo-valor-recebido" className="text-xs">Informar/ajustar valor (R$)</Label>
                        <Input id="resumo-valor-recebido" className="w-40" type="text" inputMode="decimal" value={valorRecebido} onChange={(e) => setValorRecebido(e.target.value)} placeholder="0,00" />
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => void salvarValorRecebido()}>
                        Salvar valor
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-semibold">Despesas registradas</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-muted text-left">
                      <tr>
                        <th className="p-3">Nota</th>
                        <th className="p-3">Data</th>
                        <th className="p-3">Fornecedor</th>
                        <th className="p-3">Descrição da despesa</th>
                        <th className="p-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notas.map((nota, indice) => (
                        <tr key={nota.id} className="border-t">
                          <td className="p-3">{indice + 1} · {nota.numero_nota}</td>
                          <td className="p-3 whitespace-nowrap">{dataBR(nota.data_nota)}</td>
                          <td className="p-3">{nota.fornecedor}</td>
                          <td className="p-3">{nota.descricao}</td>
                          <td className="p-3 text-right font-medium tabular-nums">
                            {nota.valor_despesa === null ? "Pendente" : moedaBRL(nota.valor_despesa)}
                          </td>
                        </tr>
                      ))}
                      {notas.length === 0 && (
                        <tr><td colSpan={5} className="p-5 text-center text-muted-foreground">Nenhuma despesa cadastrada.</td></tr>
                      )}
                    </tbody>
                    <tfoot className="border-t bg-muted/40">
                      <tr>
                        <td colSpan={4} className="p-3 text-right font-semibold">Total das despesas</td>
                        <td className="p-3 text-right font-bold tabular-nums">{moedaBRL(totalDespesas)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-sm text-muted-foreground">Valor total a ser devolvido</div>
                <div className={`mt-1 text-3xl font-bold tabular-nums ${despesasExcedentes > 0 ? "text-destructive" : "text-primary"}`}>
                  {valorDevolucao === null ? "Não calculado" : moedaBRL(valorDevolucao)}
                </div>
                {despesasExcedentes > 0 && (
                  <p className="mt-2 flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    As despesas excedem o valor recebido em {moedaBRL(despesasExcedentes)}. Confira os lançamentos antes de finalizar.
                  </p>
                )}
              </div>

              {!valorRecebidoAtual && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
                  Informe o valor recebido do adiantamento no formulário Nova nota antes de finalizar.
                </div>
              )}
              {valoresPendentes.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
                  Existem {valoresPendentes.length} nota(s) sem valor de despesa. Volte ao processo e use “Informar valor” em cada nota pendente.
                </div>
              )}

              {processoSelecionado.finalizado ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Prestação de contas finalizada</div>
                  <p className="mt-1 text-muted-foreground">Confirmação registrada em {processoSelecionado.finalizado_em ? new Date(processoSelecionado.finalizado_em).toLocaleString("pt-BR") : "data não informada"}.</p>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="flex items-start gap-2 font-medium">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Confira se o valor recebido, todas as notas e os valores das despesas estão corretos antes de confirmar a prestação de contas.
                  </p>
                  <p className="mt-2 text-muted-foreground">Ao selecionar Sim, o adiantamento será finalizado e não poderá mais receber alterações.</p>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row">
              {processoSelecionado.finalizado ? (
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={() => setDialogResumoAberto(false)}>Fechar</Button>
                  <Button type="button" onClick={() => {
                    setDialogResumoAberto(false);
                    setDialogReabrirAberto(true);
                  }}>
                    <RotateCcw className="h-4 w-4" /> Abrir para ajustes
                  </Button>
                </div>
              ) : (
                <>
                  <Button type="button" variant="outline" disabled={finalizando} onClick={() => setDialogResumoAberto(false)}>
                    Não, voltar ao adiantamento
                  </Button>
                  <Button type="button" disabled={!podeFinalizar || finalizando} onClick={() => void confirmarFinalizacao()}>
                    <CheckCircle2 className="h-4 w-4" /> {finalizando ? "Finalizando..." : "Sim, confirmar e finalizar"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogReabrirAberto} onOpenChange={(aberto) => {
          if (!reabrindo) {
            setDialogReabrirAberto(aberto);
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5" /> Abrir adiantamento para ajustes?
              </DialogTitle>
              <DialogDescription>
                O processo {processoSelecionado.processo_1doc} está finalizado. Confirme se deseja reabri-lo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-amber-900 dark:text-amber-200">
                <p className="flex items-start gap-2 font-medium">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Ao reabrir, o processo voltará a permitir alterações.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>As notas fiscais e os valores já registrados serão preservados.</li>
                  <li>Será possível incluir novas notas, ajustar valores e editar os dados do processo.</li>
                  <li>Após os ajustes, será possível gerar um novo resumo e finalizar novamente.</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                A reabertura ficará registrada no histórico, com data e identificação do usuário responsável.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={reabrindo} onClick={() => setDialogReabrirAberto(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={reabrindo} onClick={() => void confirmarReabertura()}>
                <RotateCcw className="h-4 w-4" /> {reabrindo ? "Reabrindo..." : "Sim, abrir para ajustes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogEditarProcessoAberto} onOpenChange={(aberto) => {
          if (!salvandoEdicaoProcesso) setDialogEditarProcessoAberto(aberto);
        }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" /> Ajustar dados do adiantamento
              </DialogTitle>
              <DialogDescription>
                Altere os dados do processo. O vencimento será recalculado considerando o dia do recebimento como o primeiro dia do prazo.
              </DialogDescription>
            </DialogHeader>
            <form id="form-editar-adiantamento" onSubmit={(e) => void salvarEdicaoProcesso(e)} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="editar-adiantamento-processo">Nº do processo (1Doc) *</Label>
                <Input id="editar-adiantamento-processo" value={edicaoProcesso1Doc} onChange={(e) => setEdicaoProcesso1Doc(e.target.value)} maxLength={80} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editar-adiantamento-recebimento">Data do recebimento *</Label>
                <Input id="editar-adiantamento-recebimento" type="date" value={edicaoDataRecebimento} onChange={(e) => setEdicaoDataRecebimento(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editar-adiantamento-periodo">Período de aplicação (dias) *</Label>
                <Input id="editar-adiantamento-periodo" type="number" min={1} step={1} value={edicaoPeriodoAplicacao} onChange={(e) => setEdicaoPeriodoAplicacao(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editar-adiantamento-vencimento">Data do vencimento</Label>
                <Input id="editar-adiantamento-vencimento" type="date" value={somarDias(edicaoDataRecebimento, Number(edicaoPeriodoAplicacao))} readOnly className="bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editar-adiantamento-empenho">Nº do empenho *</Label>
                <Input id="editar-adiantamento-empenho" value={edicaoNumeroEmpenho} onChange={(e) => setEdicaoNumeroEmpenho(e.target.value)} maxLength={80} required />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="editar-adiantamento-valor">Valor do adiantamento recebido (R$) *</Label>
                <Input id="editar-adiantamento-valor" type="text" inputMode="decimal" value={edicaoValorRecebido} onChange={(e) => setEdicaoValorRecebido(e.target.value)} placeholder="Ex.: 3.500,00" required />
              </div>
            </form>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogEditarProcessoAberto(false)} disabled={salvandoEdicaoProcesso}>Cancelar</Button>
              <Button type="submit" form="form-editar-adiantamento" disabled={salvandoEdicaoProcesso}>
                {salvandoEdicaoProcesso ? "Salvando ajustes..." : "Salvar ajustes"}
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="adiantamento-valor-recebido">Valor do adiantamento recebido (R$) *</Label>
              <Input
                id="adiantamento-valor-recebido"
                type="text"
                inputMode="decimal"
                value={valorRecebidoProcesso}
                onChange={(e) => setValorRecebidoProcesso(e.target.value)}
                placeholder="Ex.: 3.500,00"
                required
              />
              <p className="text-xs text-muted-foreground">Informe o valor total creditado para este processo. Ele será utilizado no resumo da execução financeira.</p>
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
