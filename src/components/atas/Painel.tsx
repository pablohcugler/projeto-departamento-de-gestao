import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import { AlertTriangle, ArrowLeft, FileText, LogOut, UserPlus, FileUp, Pencil, Plus, Tags, Trash2, X, CircleUserRound, MessageSquareText, ClipboardList, ChartNoAxesCombined } from "lucide-react";
import { Contratos } from "./Contratos";
import { NovoUsuario } from "./NovoUsuario";
import { ImportarItens } from "./ImportarItens";
import { CriarPedido } from "./CriarPedido";
import { Pedidos } from "./Pedidos";
import { Administracao } from "./Administracao";
import { TemaToggle } from "./TemaToggle";
import { ConfigTv } from "@/components/tv/ConfigTv";
import { brl, dataBR, diasParaVencer, statusAta, type StatusAta } from "@/lib/vencimento";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EnviarFeedback, RelatorioFeedbacks } from "./Feedbacks";
import { extrairDadosAtaPdf } from "@/lib/importar.functions";
import type { ItemImportado } from "@/lib/importacao-ata";

type Ata = Tables<"atas">;
type Item = Tables<"ata_itens">;
type Classe = Tables<"classificacoes">;

const FASES = ["Não iniciado", "Cotação", "Estudo Técnico Preliminar", "Termo de Referência", "Edital / Licitação", "Publicado", "Concluído"];

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
  const [novoUsuario, setNovoUsuario] = useState(false);
  const [feedbackAberto, setFeedbackAberto] = useState(false);
  const [relatoriosAberto, setRelatoriosAberto] = useState(false);
  const adminQ = useQuery({
    queryKey: ["admin", userId],
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      return !!data;
    },
  });
  const [aba, setAba] = useState<"atas" | "contratos" | "pedidos" | "feedbacks" | "administracao">("atas");
  const [navegacaoRestaurada, setNavegacaoRestaurada] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Ata> | null>(null);
  const extrairDadosAta = useServerFn(extrairDadosAtaPdf);
  const inputPdfAta = useRef<HTMLInputElement>(null);
  const [arquivoPdfAta, setArquivoPdfAta] = useState<File | null>(null);
  const [itensPdfAta, setItensPdfAta] = useState<ItemImportado[]>([]);
  const [lendoPdfAta, setLendoPdfAta] = useState(false);
  const [pedidoAberto, setPedidoAberto] = useState(false);
  const [gerirClasses, setGerirClasses] = useState(false);
  const [filtroClasse, setFiltroClasse] = useState<string>("todas");
  const [filtroSituacao, setFiltroSituacao] = useState<"todas" | "Em andamento" | "Vigentes">("todas");
  const [filtroSituacaoContratos, setFiltroSituacaoContratos] = useState<"todas" | "Em andamento" | "Vigentes">("todas");
  const [busca, setBusca] = useState("");

  // Restaura a última tela e os filtros deste usuário após F5/recarregamento.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem("gestao-saude-painel:" + userId);
      if (salvo) {
        const estado = JSON.parse(salvo) as {
          aba?: string;
          selecionada?: string | null;
          filtroClasse?: string;
          filtroSituacao?: string;
          filtroSituacaoContratos?: string;
          busca?: string;
        };
        if (["atas", "contratos", "pedidos", "feedbacks", "administracao"].includes(estado.aba ?? "")) {
          setAba(estado.aba as typeof aba);
        }
        if (typeof estado.selecionada === "string") setSelecionada(estado.selecionada);
        if (typeof estado.filtroClasse === "string") setFiltroClasse(estado.filtroClasse);
        if (["todas", "Em andamento", "Vigentes"].includes(estado.filtroSituacao ?? "")) {
          setFiltroSituacao(estado.filtroSituacao as typeof filtroSituacao);
        }
        if (["todas", "Em andamento", "Vigentes"].includes(estado.filtroSituacaoContratos ?? "")) {
          setFiltroSituacaoContratos(estado.filtroSituacaoContratos as typeof filtroSituacaoContratos);
        }
        if (typeof estado.busca === "string") setBusca(estado.busca);
      }
    } catch {
      localStorage.removeItem("gestao-saude-painel:" + userId);
    } finally {
      setNavegacaoRestaurada(true);
    }
  }, [userId]);

  useEffect(() => {
    if (!navegacaoRestaurada) return;
    try {
      localStorage.setItem("gestao-saude-painel:" + userId, JSON.stringify({
        aba, selecionada, filtroClasse, filtroSituacao, filtroSituacaoContratos, busca,
      }));
    } catch {
      // A navegação continua funcionando mesmo quando o navegador bloqueia armazenamento local.
    }
  }, [navegacaoRestaurada, userId, aba, selecionada, filtroClasse, filtroSituacao, filtroSituacaoContratos, busca]);

  useEffect(() => {
    if (adminQ.isSuccess && !adminQ.data && (aba === "administracao" || aba === "feedbacks")) {
      setAba("atas");
    }
  }, [adminQ.isSuccess, adminQ.data, aba]);

  const atasQ = useQuery({
    queryKey: ["atas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("atas").select("*").order("data_vencimento");
      if (error) throw error;
      return data;
    },
  });

  // A consulta automatizada da listagem pública da BLL foi desativada:
  // o portal está retornando CAPTCHA/anti-bot às requisições do servidor.
  // O status deve ser confirmado manualmente até a BLL fornecer acesso oficial
  // por Web Service/API para o órgão.
  const editaisParaConsultaBll = useMemo(
    () =>
      (atasQ.data ?? [])
        .filter(
          (ata) =>
            ata.situacao_cadastro === "Em andamento" &&
            ata.fase_processo === "Publicado" &&
            !!ata.numero_edital_bll?.trim(),
        )
        .map((ata) => ({ ataId: ata.id, numeroEdital: ata.numero_edital_bll!.trim() })),
    [atasQ.data],
  );
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
          (filtroSituacao === "todas" || a.situacao_cadastro === filtroSituacao) &&
          `${a.numero ?? ""} ${a.numero_edital_bll ?? ""} ${a.objeto} ${fornecedoresDe(a, totaisQ.data?.f?.[a.id])} ${a.processo ?? ""}`.toLowerCase().includes(busca.toLowerCase()),
      ),
    [atas, filtroClasse, filtroSituacao, busca, totaisQ.data],
  );
  const alertas = atas.filter((a) =>
    (filtroSituacao === "todas" || a.situacao_cadastro === filtroSituacao) &&
    a.situacao_cadastro === "Vigentes" &&
    statusAta(a.data_vencimento, a.dias_alerta) !== "vigente",
  );

  // O formulário muda conforme o módulo selecionado no menu superior.
  // Atas em andamento ainda não possuem número de Ata, processo licitatório ou alerta de vencimento.
  const ataVigente = !!editando && editando.situacao_cadastro === "Vigentes";
  const ataEmAndamento = !!editando && editando.situacao_cadastro !== "Vigentes";
  const ataSel = atas.find((a) => a.id === selecionada);

  async function importarPdfDaAta(arquivo?: File) {
    if (!arquivo) return;
    if (arquivo.type !== "application/pdf" && !arquivo.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Selecione um arquivo PDF da Ata de Registro de Preços.");
      return;
    }
    if (arquivo.size === 0 || arquivo.size > 10 * 1024 * 1024) {
      toast.error(arquivo.size === 0 ? "O arquivo selecionado está vazio." : "O PDF ultrapassa o limite de 10 MB.");
      return;
    }

    setLendoPdfAta(true);
    setArquivoPdfAta(arquivo);
    setItensPdfAta([]);
    try {
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => {
          if (!(leitor.result instanceof ArrayBuffer)) {
            reject(new Error("O navegador não retornou os dados binários do PDF."));
            return;
          }
          resolve(new Uint8Array(leitor.result));
        };
        leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
        leitor.onabort = () => reject(new Error("A leitura do PDF foi cancelada."));
        leitor.readAsArrayBuffer(arquivo);
      });
      if (bytes.length === 0 || bytes.length !== arquivo.size) {
        throw new Error("A leitura do PDF ficou incompleta. Salve uma cópia do arquivo no computador e tente novamente.");
      }

      let binario = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const resposta = await extrairDadosAta({ data: { base64: btoa(binario) } });
      if (resposta.erro) {
        toast.warning(resposta.erro + " O arquivo será mantido para anexação após o cadastro; preencha os campos manualmente.");
        return;
      }

      const dados = resposta.dados;
      setItensPdfAta(resposta.itens ?? []);
      setEditando((atual) => atual ? ({
        ...atual,
        ...(dados.numero ? { numero: dados.numero } : {}),
        ...(dados.processo ? { processo: dados.processo } : {}),
        ...(dados.objeto ? { objeto: dados.objeto } : {}),
        ...(dados.data_homologacao ? { data_homologacao: dados.data_homologacao } : {}),
        ...(dados.data_vencimento ? { data_vencimento: dados.data_vencimento } : {}),
        ...(dados.pregao ? { pregao: dados.pregao } : {}),
      }) : atual);

      const nomes: Record<string, string> = {
        numero: "número da ata",
        processo: "número do processo",
        objeto: "objeto",
        data_homologacao: "data de homologação (Data Início)",
        data_vencimento: "data de vencimento (Data Fim)",
        pregao: "pregão eletrônico (Sequência)",
      };
      const encontrados = resposta.camposEncontrados.map((campo) => nomes[campo] ?? campo);
      const faltantes = Object.keys(nomes).filter((campo) => !resposta.camposEncontrados.includes(campo)).map((campo) => nomes[campo]);
      toast.success(
        "PDF lido. Campos preenchidos: " + (encontrados.length ? encontrados.join(", ") : "nenhum campo cadastral") +
        ". Itens identificados: " + (resposta.itensEncontrados ?? 0) + ".",
      );
      if (faltantes.length) {
        toast.warning("Não localizei no PDF: " + faltantes.join(", ") + ". Confira e preencha manualmente.");
      }
      if (resposta.avisoItens) {
        toast.warning(resposta.avisoItens);
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro inesperado ao ler o PDF.";
      toast.error(mensagem);
    } finally {
      setLendoPdfAta(false);
      if (inputPdfAta.current) inputPdfAta.current.value = "";
    }
  }

  function fecharFormularioAta() {
    setEditando(null);
    setArquivoPdfAta(null);
    setItensPdfAta([]);
    setLendoPdfAta(false);
    if (inputPdfAta.current) inputPdfAta.current.value = "";
  }

  async function salvarAta() {
    if (!editando?.memorando_1doc?.trim() || !editando?.processo_1doc?.trim()) {
      toast.error("Informe o número do Memorando e do Processo Administrativo no 1Doc.");
      return;
    }
    if (!editando.id && !editando.classificacao_id) {
      toast.error("Selecione uma classificação para a nova ata.");
      return;
    }
    if (arquivoPdfAta && itensPdfAta.length === 0) {
      toast.error("O PDF foi anexado, mas nenhum item foi reconhecido. Não é possível concluir uma importação como completa. Envie o PDF com a tabela de itens legível ou faça a inclusão dos itens manualmente.");
      return;
    }
    const itemInvalido = itensPdfAta.find((item) =>
      !item.descricao.trim() ||
      !item.unidade.trim() ||
      !Number.isFinite(item.quantidade) ||
      item.quantidade <= 0 ||
      !Number.isFinite(item.preco_unitario) ||
      item.preco_unitario < 0
    );
    if (itemInvalido) {
      toast.error("Há itens com descrição, unidade, quantidade ou preço inválido. Corrija o documento ou importe os itens manualmente antes de salvar.");
      return;
    }
    if ((!ataEmAndamento && !editando?.numero?.trim()) || !editando?.objeto?.trim() || !editando.data_vencimento) {
      toast.error(ataEmAndamento
        ? "Preencha o objeto e a data de vencimento."
        : "Preencha o número da Ata, o objeto e a data de vencimento.");
      return;
    }
    if (ataEmAndamento && editando.fase_processo === "Publicado" && !editando.numero_edital_bll?.trim()) {
      toast.error("Informe o número do edital publicado na BLL.");
      return;
    }
    const payload = {
      numero: editando.numero?.trim() || null,
      processo: editando.processo || null,
      numero_edital_bll: editando.numero_edital_bll?.trim() || null,
      objeto: editando.objeto,
      data_homologacao: editando.data_homologacao || null,
      data_vencimento: editando.data_vencimento,
      dias_alerta: Number(editando.dias_alerta ?? 90),
      observacoes: editando.observacoes || null,
      pregao: editando.pregao || null,
      memorando_1doc: editando.memorando_1doc || null,
      processo_1doc: editando.processo_1doc || null,
      fase_processo: editando.fase_processo || null,
      classificacao_id: editando.classificacao_id || null,
      situacao_cadastro: editando.situacao_cadastro ?? "Em andamento",
    };
    let ataIdSalva = editando.id;
    if (editando.id) {
      const { error } = await supabase.from("atas").update(payload).eq("id", editando.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("atas").insert(payload).select("id").single();
      if (error || !data) { toast.error(error?.message ?? "Não foi possível salvar a ata."); return; }
      ataIdSalva = data.id;
      setEditando({ ...editando, id: data.id });
    }

    if (itensPdfAta.length > 0 && ataIdSalva) {
      const { error: erroItens } = await supabase.from("ata_itens").insert(
        itensPdfAta.map((item) => ({
          ata_id: ataIdSalva!,
          codigo_item: item.codigo_item || null,
          codigo_produto: item.codigo_produto || null,
          descricao: item.descricao.trim(),
          fornecedor: item.fornecedor.trim() || null,
          unidade: item.unidade.trim(),
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
        })),
      );
      if (erroItens) {
        toast.error("A ata foi salva, mas os " + itensPdfAta.length + " itens não foram gravados: " + erroItens.message + ". O cadastro ficou aberto para você tentar novamente; não crie outra ata.");
        return;
      }
    }

    if (arquivoPdfAta && ataIdSalva) {
      const seguro = arquivoPdfAta.name.normalize("NFD").replace(/[^\w.\-]+/g, "_");
      const caminho = "ata/" + ataIdSalva + "/" + Date.now() + "_" + seguro;
      const upload = await supabase.storage.from("anexos").upload(caminho, arquivoPdfAta);
      if (upload.error) {
        toast.warning("Ata salva, mas não foi possível anexar o PDF: " + upload.error.message);
      } else {
        const { error: erroAnexo } = await supabase.from("anexos").insert({
          ref_tipo: "ata",
          ref_id: ataIdSalva,
          tipo_doc: "Ata de Registro de Preços",
          nome: arquivoPdfAta.name,
          caminho,
        });
        if (erroAnexo) {
          await supabase.storage.from("anexos").remove([caminho]);
          toast.warning("Ata salva, mas houve falha ao registrar o PDF como anexo: " + erroAnexo.message);
        }
      }
    }

    toast.success("Ata salva.");
    setEditando(null);
    setArquivoPdfAta(null);
    setItensPdfAta([]);
    if (inputPdfAta.current) inputPdfAta.current.value = "";
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
          <div className="app-brand flex min-w-0 items-center gap-3">
            <div className="app-crest"><img src={brasaoMunicipio} alt="Brasão do município" className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" /></div>
            <div className="leading-tight"><span className="block font-semibold tracking-tight text-base sm:text-lg">Gestão em Saúde</span><span className="block text-[10px] uppercase tracking-[0.17em] opacity-70">Prefeitura de Cajati</span></div>
          </div>
          <nav className="app-nav flex gap-1" aria-label="Navegação por situação">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant={aba === "atas" ? "secondary" : "ghost"} className={aba === "atas" ? "app-nav-active" : "app-nav-item"}>
                  Atas de Registro <span className="ml-1 text-xs opacity-70">⌄</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Exibir Atas de Registro</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { setAba("atas"); setSelecionada(null); setFiltroSituacao("Vigentes"); setBusca(""); }}>
                  {filtroSituacao === "Vigentes" ? "✓ " : ""}Vigentes
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setAba("atas"); setSelecionada(null); setFiltroSituacao("Em andamento"); setBusca(""); }}>
                  {filtroSituacao === "Em andamento" ? "✓ " : ""}Em andamento
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant={aba === "contratos" ? "secondary" : "ghost"} className={aba === "contratos" ? "app-nav-active" : "app-nav-item"}>
                  Contratos <span className="ml-1 text-xs opacity-70">⌄</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Exibir Contratos</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { setAba("contratos"); setSelecionada(null); setFiltroSituacaoContratos("Vigentes"); setBusca(""); }}>
                  {filtroSituacaoContratos === "Vigentes" ? "✓ " : ""}Vigentes
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setAba("contratos"); setSelecionada(null); setFiltroSituacaoContratos("Em andamento"); setBusca(""); }}>
                  {filtroSituacaoContratos === "Em andamento" ? "✓ " : ""}Em andamento
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant={aba === "pedidos" ? "secondary" : "ghost"} className={aba === "pedidos" ? "app-nav-active" : "app-nav-item"} onClick={() => { setAba("pedidos"); setSelecionada(null); }}>
              Pedidos
            </Button>
          </nav>
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
                <DropdownMenuItem onSelect={() => setRelatoriosAberto(true)}><ChartNoAxesCombined className="h-4 w-4" /> Relatórios</DropdownMenuItem>
                {adminQ.data && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setNovoUsuario(true)}><UserPlus className="h-4 w-4" /> Novo usuário</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { setAba("administracao"); setSelecionada(null); }}><CircleUserRound className="h-4 w-4" /> Administração de usuários</DropdownMenuItem>
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

      <main className="app-main mx-auto w-full max-w-none py-6 sm:py-9">
        {aba === "administracao" ? (
          <Administracao />
        ) : aba === "pedidos" ? (
          <Pedidos atas={atas} />
        ) : aba === "feedbacks" ? (
          <div className="space-y-4">
            <Button variant="outline" onClick={() => setAba("atas")}>
              <ArrowLeft className="h-4 w-4" /> Voltar ao painel
            </Button>
            <RelatorioFeedbacks />
          </div>
        ) : aba === "contratos" ? (
          <Contratos classes={classes} onGerirClasses={() => setGerirClasses(true)} filtroSituacao={filtroSituacaoContratos} />
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
                <p className="text-sm text-muted-foreground">{filtradas.length} ata(s) exibida(s) nesta situação · {atas.length} cadastrada(s) no sistema</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {filtroSituacao === "Vigentes" && (
                  <Button variant="outline" onClick={() => setPedidoAberto(true)} disabled={atas.every((ata) => ata.situacao_cadastro !== "Vigentes")}>
                    <FileText className="h-4 w-4" /> Criar Pedido
                  </Button>
                )}
                <Button variant="outline" onClick={() => setGerirClasses(true)}>
                  <Tags className="h-4 w-4" /> Classificações
                </Button>
                <Button onClick={() => { setArquivoPdfAta(null); if (inputPdfAta.current) inputPdfAta.current.value = ""; setEditando({ dias_alerta: 90, situacao_cadastro: filtroSituacao === "todas" ? "Em andamento" : filtroSituacao }); }}>
                  <Plus className="h-4 w-4" /> Nova ata
                </Button>
              </div>
            </div>

            <div className="app-toolbar mb-4 flex flex-wrap gap-2">
              <Input placeholder="Buscar por número, objeto, fornecedor..." className="w-full sm:max-w-xs" value={busca} onChange={(e) => setBusca(e.target.value)} />
              {filtroSituacao !== "Vigentes" && editaisParaConsultaBll.length > 0 && (
                <span className="inline-flex items-center rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                  Consulta automática da BLL temporariamente indisponível
                </span>
              )}
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

            <div className="app-table-wrap app-responsive-table overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nº Ata</th>
                    <th className="px-4 py-3 font-medium">Objeto</th>
                    <th className="px-4 py-3 font-medium">Classificação</th>
                    <th className="px-4 py-3 font-medium">Vencimento</th>
                    <th className="px-4 py-3 font-medium">Cadastro</th>
                    <th className="px-4 py-3 text-right font-medium">Valor total</th>
                    <th className="px-4 py-3 font-medium">Situação do vencimento</th>
                    <th className="px-4 py-3 font-medium">Fase do processo</th>
                    {filtroSituacao !== "Vigentes" && <th className="px-4 py-3 font-medium">Status BLL</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((a) => (
                    <tr key={a.id} className="cursor-pointer border-t hover:bg-accent/50" onClick={() => setSelecionada(a.id)}>
                      <td data-label="Nº Ata" className="px-4 py-3 font-medium">{a.numero ?? "Em andamento"}</td>
                      <td data-label="Objeto" className="px-4 py-3">{a.objeto}</td>
                      <td data-label="Classificação" className="px-4 py-3 text-muted-foreground">{nomeClasse(a.classificacao_id) ?? "—"}</td>
                      <td data-label="Vencimento" className="px-4 py-3">
                        {dataBR(a.data_vencimento)}
                        <div className="text-xs text-muted-foreground">{a.situacao_cadastro === "Vigentes" ? textoDias(diasParaVencer(a.data_vencimento)) : "Sem cálculo enquanto em andamento"}</div>
                      </td>
                      <td data-label="Cadastro" className="px-4 py-3">
                        <span className={a.situacao_cadastro === "Vigentes" ? "rounded-full bg-success/15 px-2.5 py-1 text-xs text-success" : "rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"}>
                          {a.situacao_cadastro}
                        </span>
                      </td>
                      <td data-label="Valor total" className="px-4 py-3 text-right tabular-nums">{brl(totaisQ.data?.m?.[a.id] ?? 0)}</td>
                      <td data-label="Situação do vencimento" className="px-4 py-3">{a.situacao_cadastro === "Vigentes" ? <StatusBadge ata={a} /> : "—"}</td>
                      <td data-label="Fase do processo" className="px-4 py-3">{a.fase_processo ?? "—"}{a.observacoes && <div className="max-w-56 truncate text-xs text-muted-foreground" title={a.observacoes}>{a.observacoes}</div>}</td>
                      {filtroSituacao !== "Vigentes" && (
                        <td data-label="Status BLL" className="px-4 py-3">
                          {a.situacao_cadastro !== "Em andamento" || a.fase_processo !== "Publicado" ? "—" : !a.numero_edital_bll ? "Edital não informado" : (
                            <div className="min-w-40 whitespace-normal text-xs">
                              <span className="font-medium text-warning-foreground">Conferência manual necessária</span>
                              <div className="mt-1 text-muted-foreground">
                                Nº {a.numero_edital_bll}. A BLL bloqueou a consulta automática; nenhum status foi confirmado.
                              </div>
                            </div>
                          )}
                          {a.situacao_cadastro === "Em andamento" && a.fase_processo === "Publicado" && (
                            <a className="mt-1 inline-block text-[10px] text-primary underline" href={`https://bllcompras.com/Process/ProcessSearchPublic?param1=0`} target="_blank" rel="noreferrer">Abrir BLL para conferir</a>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {filtradas.length === 0 && (
                    <tr>
                      <td colSpan={filtroSituacao !== "Vigentes" ? 9 : 8} className="px-4 py-12 text-center text-muted-foreground">
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

      <Dialog open={!!editando} onOpenChange={(o) => !o && fecharFormularioAta()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar ata" : "Nova ata"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!editando.id && ataVigente && (
                <Campo label="Importar dados da Ata (PDF)" full>
                  <input
                    ref={inputPdfAta}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={lendoPdfAta}
                    onChange={(e) => { void importarPdfDaAta(e.target.files?.[0]); }}
                  />
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
                    <Button type="button" variant="outline" disabled={lendoPdfAta} onClick={() => inputPdfAta.current?.click()}>
                      <FileUp className="h-4 w-4" /> {lendoPdfAta ? "Lendo PDF..." : "Selecionar PDF da ata"}
                    </Button>
                    {arquivoPdfAta && <span className="max-w-full truncate text-xs text-muted-foreground">{arquivoPdfAta.name}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O sistema preencherá número da ata, processo, objeto, Data Início (homologação), Data Fim (vencimento) e Sequência (pregão eletrônico), além de tentar importar todos os itens da tabela. A classificação e os números do 1Doc serão informados pelo usuário.
                  </p>
                  {arquivoPdfAta && (
                    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
                      <div className="font-medium">
                        {itensPdfAta.length} item(ns) identificados no PDF
                      </div>
                      {itensPdfAta.length > 0 ? (
                        <>
                          <p className="text-xs text-muted-foreground">Confira a lista antes de salvar. Todos os itens abaixo serão vinculados à ata.</p>
                          <div className="max-h-56 overflow-auto rounded border bg-background">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-muted text-left">
                                <tr>
                                  <th className="p-2">Item</th>
                                  <th className="p-2">Descrição</th>
                                  <th className="p-2">Unid.</th>
                                  <th className="p-2 text-right">Quantidade</th>
                                  <th className="p-2 text-right">Valor unitário</th>
                                  <th className="p-2">Fornecedor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {itensPdfAta.map((item, indice) => (
                                  <tr key={item.codigo_item + "-" + indice} className="border-t">
                                    <td className="p-2">{item.codigo_item || "—"}</td>
                                    <td className="p-2 whitespace-normal">{item.descricao}</td>
                                    <td className="p-2">{item.unidade}</td>
                                    <td className="p-2 text-right">{item.quantidade.toLocaleString("pt-BR")}</td>
                                    <td className="p-2 text-right">{brl(item.preco_unitario)}</td>
                                    <td className="p-2">{item.fornecedor || "Não identificado"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="text-right text-xs font-semibold">Total dos itens: {brl(itensPdfAta.reduce((total, item) => total + item.quantidade * item.preco_unitario, 0))}</div>
                        </>
                      ) : (
                        <p className="text-xs text-warning-foreground">
                          Nenhum item foi reconhecido. O cadastro não poderá ser salvo como importação completa; envie o PDF que contém a tabela de itens ou importe os itens manualmente.
                        </p>
                      )}
                    </div>
                  )}
                </Campo>
              )}
              {!ataEmAndamento && <Campo label="Nº da ata *"><Input value={editando.numero ?? ""} onChange={(e) => setEditando({ ...editando, numero: e.target.value })} /></Campo>}
              {!ataEmAndamento && <Campo label="Nº do processo"><Input value={editando.processo ?? ""} onChange={(e) => setEditando({ ...editando, processo: e.target.value })} /></Campo>}
              <Campo label="Objeto *" full><Input value={editando.objeto ?? ""} onChange={(e) => setEditando({ ...editando, objeto: e.target.value })} /></Campo>
              <Campo label="Classificação *">
                <select
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={editando.classificacao_id ?? ""}
                  onChange={(e) => setEditando({ ...editando, classificacao_id: e.target.value || null })}
                >
                  <option value="">Selecione uma classificação...</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Data de homologação"><Input type="date" value={editando.data_homologacao ?? ""} onChange={(e) => setEditando({ ...editando, data_homologacao: e.target.value })} /></Campo>
              <Campo label="Data de vencimento *"><Input type="date" value={editando.data_vencimento ?? ""} onChange={(e) => setEditando({ ...editando, data_vencimento: e.target.value })} /></Campo>
              {!ataEmAndamento && (
                <Campo label="Alertar com quantos dias de antecedência?" full>
                  <Input type="number" min={1} value={editando.dias_alerta ?? 90} onChange={(e) => setEditando({ ...editando, dias_alerta: Number(e.target.value) })} />
                </Campo>
              )}
              {!ataVigente && (
              <Campo label="Fase do novo processo" full>
                <select className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={editando.fase_processo ?? ""} onChange={(e) => setEditando({ ...editando, fase_processo: e.target.value || null })}>
                  <option value="">—</option>
                  {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Campo>
              )}
              {ataEmAndamento && editando.fase_processo === "Publicado" && (
                <Campo label="Nº do edital na BLL *" full>
                  <Input
                    placeholder="Ex.: PE096/2026CJ"
                    value={editando.numero_edital_bll ?? ""}
                    onChange={(e) => setEditando({ ...editando, numero_edital_bll: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Promotor fixo: MUNICIPIO DE CAJATI. O número será utilizado para consultar a situação pública na BLL.</p>
                </Campo>
              )}
              {!ataVigente && (
              <Campo label="Observações sobre o andamento" full><Textarea placeholder="Ex.: cotação enviada a 3 fornecedores em 10/11..." value={editando.observacoes ?? ""} onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })} /></Campo>
              )}
              <Campo label="Nº do Pregão Eletrônico" full><Input placeholder="Opcional" value={editando.pregao ?? ""} onChange={(e) => setEditando({ ...editando, pregao: e.target.value })} /></Campo>
              <Campo label="Nº do Memorando (1Doc) *"><Input required placeholder="Número do memorando no 1Doc" value={editando.memorando_1doc ?? ""} onChange={(e) => setEditando({ ...editando, memorando_1doc: e.target.value })} /></Campo>
              <Campo label="Processo Administrativo (1Doc) *"><Input required placeholder="Número do processo no 1Doc" value={editando.processo_1doc ?? ""} onChange={(e) => setEditando({ ...editando, processo_1doc: e.target.value })} /></Campo>
              <Campo label="Documentos anexos (opcional)" full><Anexos refTipo="ata" refId={editando.id} /></Campo>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={fecharFormularioAta}>Cancelar</Button>
            <Button onClick={salvarAta}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={relatoriosAberto} onOpenChange={setRelatoriosAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Relatórios</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Estamos trabalhando nesta funcionalidade ainda</p>
          <DialogFooter>
            <Button onClick={() => setRelatoriosAberto(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EnviarFeedback aberto={feedbackAberto} onFechar={() => setFeedbackAberto(false)} userId={userId} nome={nome} />
      <NovoUsuario aberto={novoUsuario} onFechar={() => setNovoUsuario(false)} />
      <GerirClasses aberto={gerirClasses} onFechar={() => setGerirClasses(false)} classes={classes} />
      <CriarPedido aberto={pedidoAberto} onFechar={() => setPedidoAberto(false)} atas={atas.filter((ata) => ata.situacao_cadastro === "Vigentes")} onPedidoSalvo={() => { void qc.invalidateQueries({ queryKey: ["pedidos"] }); }} />
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
  // A contagem considera somente fornecedores dos itens vinculados a esta Ata.
  // O campo legado ata.fornecedor não é mais utilizado no cálculo.
  const fornecedoresContados = new Set(
    itens
      .map((item) => (item.fornecedor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR"))
      .filter(Boolean),
  ).size;
  const [importar, setImportar] = useState(false);
  const [descricaoCompleta, setDescricaoCompleta] = useState<string | null>(null);
  const [novo, setNovo] = useState({ codigo_item: "", codigo_produto: "", descricao: "", fornecedor: "", unidade: "UN", quantidade: "1", preco_unitario: "" });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["itens", ata.id] });
    qc.invalidateQueries({ queryKey: ["totais"] });
  };

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.descricao || !novo.preco_unitario) { toast.error("Informe descrição e preço unitário."); return; }
    const { error } = await supabase.from("ata_itens").insert({
      ata_id: ata.id,
      codigo_item: novo.codigo_item || null,
      codigo_produto: novo.codigo_produto || null,
      descricao: novo.descricao,
      fornecedor: novo.fornecedor || null,
      unidade: novo.unidade || "UN",
      quantidade: Number(novo.quantidade.replace(",", ".")),
      preco_unitario: Number(novo.preco_unitario.replace(",", ".")),
    });
    if (error) { toast.error(error.message); return; }
    setNovo({ codigo_item: "", codigo_produto: "", descricao: "", fornecedor: novo.fornecedor, unidade: "UN", quantidade: "1", preco_unitario: "" });
    recarregar();
  }
  async function removerItem(i: Item) {
    await supabase.from("ata_itens").delete().eq("id", i.id);
    recarregar();
  }

  const dias = ata.situacao_cadastro === "Vigentes" ? diasParaVencer(ata.data_vencimento) : null;
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onVoltar} className="mb-4"><ArrowLeft className="h-4 w-4" /> Voltar</Button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {ata.situacao_cadastro === "Vigentes" ? <StatusBadge ata={ata} /> : <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Em andamento</span>}
            {classe && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">{classe}</span>}
          </div>
          <h2 className="font-display text-3xl">{ata.numero ? `Ata ${ata.numero}` : "Ata em andamento"}</h2>
          <p className="text-muted-foreground">{ata.objeto}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEditar}><Pencil className="h-4 w-4" /> Editar</Button>
          <Button variant="outline" onClick={onExcluir}><Trash2 className="h-4 w-4" /> Excluir</Button>
        </div>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Info
          rotulo="Fornecedores"
          valor={`${fornecedoresContados} ${fornecedoresContados === 1 ? "fornecedor" : "fornecedores"}`}
        />
        <Info rotulo="Homologação" valor={dataBR(ata.data_homologacao)} />
        <Info rotulo="Vencimento" valor={`${dataBR(ata.data_vencimento)} · ${dias === null ? "não computado enquanto em andamento" : textoDias(dias)}`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Itens da ata</h3>
        {ata.situacao_cadastro === "Vigentes" && <Button variant="outline" onClick={() => setImportar(true)}><FileUp className="h-4 w-4" /> Importar itens (PDF ou planilha)</Button>}
      </div>
      <ImportarItens ataId={ata.id} aberto={importar} onFechar={() => setImportar(false)} onImportado={recarregar} />
      <div className="app-responsive-table overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Cód. item</th>
              <th className="px-4 py-3 font-medium">Cód. produto</th>
              <th className="px-4 py-3 font-medium">Descrição</th>
              <th className="px-4 py-3 font-medium">Fornecedor</th>
              <th className="px-4 py-3 font-medium">Unid.</th>
              <th className="px-4 py-3 text-right font-medium">Qtd. contratada</th>
              <th className="px-4 py-3 text-right font-medium">Saldo disponível</th>
              <th className="px-4 py-3 text-right font-medium">Preço unitário</th>
              <th className="px-4 py-3 text-right font-medium">Preço total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((i, idx) => (
              <tr key={i.id} className="border-t">
                <td data-label="#" className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                <td data-label="Cód. item" className="px-4 py-2.5">{i.codigo_item ?? "—"}</td>
                <td data-label="Cód. produto" className="px-4 py-2.5">{i.codigo_produto ?? "—"}</td>
                <td data-label="Descrição" className="px-4 py-2.5">
                  <button
                    type="button"
                    className="app-item-description"
                    title="Clique para visualizar a descrição completa"
                    aria-label={`Visualizar descrição completa do item ${i.codigo_item ?? idx + 1}`}
                    onClick={() => setDescricaoCompleta(i.descricao)}
                  >
                    {i.descricao}
                  </button>
                </td>
                <td data-label="Fornecedor" className="px-4 py-2.5 text-muted-foreground">{i.fornecedor ?? "—"}</td>
                <td data-label="Unidade" className="px-4 py-2.5">{i.unidade}</td>
                <td data-label="Qtd. contratada" className="px-4 py-2.5 text-right tabular-nums">{Number(i.quantidade).toLocaleString("pt-BR")}</td>
                <td data-label="Saldo disponível" className="px-4 py-2.5 text-right tabular-nums">
                  {i.saldo_disponivel === null ? "Não atualizado" : (
                    <>
                      {Number(i.saldo_disponivel).toLocaleString("pt-BR")}
                      <div className="text-[10px] text-muted-foreground">{i.saldo_atualizado_em ? dataBR(i.saldo_atualizado_em) : ""}</div>
                    </>
                  )}
                </td>
                <td data-label="Preço unitário" className="px-4 py-2.5 text-right tabular-nums">{brl(Number(i.preco_unitario))}</td>
                <td data-label="Preço total" className="px-4 py-2.5 text-right font-medium tabular-nums">{brl(Number(i.preco_total))}</td>
                <td data-label="Ações" className="px-2"><Button variant="ghost" size="icon" aria-label="Remover item" onClick={() => removerItem(i)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            <tr className="app-table-total border-t bg-muted/50">
              <td colSpan={9} className="px-4 py-3 text-right font-semibold">Valor total da ata</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{brl(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <form onSubmit={addItem} className="app-item-form grid gap-2 border-t p-4 sm:grid-cols-[90px_110px_1fr_180px_70px_100px_140px_auto]">
          <Input placeholder="Cód. item" value={novo.codigo_item} onChange={(e) => setNovo({ ...novo, codigo_item: e.target.value })} />
          <Input placeholder="Cód. produto" value={novo.codigo_produto} onChange={(e) => setNovo({ ...novo, codigo_produto: e.target.value })} />
          <Input placeholder="Descrição do item" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          <Input placeholder="Fornecedor" value={novo.fornecedor} onChange={(e) => setNovo({ ...novo, fornecedor: e.target.value })} />
          <Input placeholder="Unid." value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value })} />
          <Input placeholder="Qtd." inputMode="decimal" value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} />
          <Input placeholder="Preço unit. (R$)" inputMode="decimal" value={novo.preco_unitario} onChange={(e) => setNovo({ ...novo, preco_unitario: e.target.value })} />
          <Button type="submit"><Plus className="h-4 w-4" /> Item</Button>
        </form>
      </div>
      <Dialog open={descricaoCompleta !== null} onOpenChange={(aberto) => !aberto && setDescricaoCompleta(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Descrição completa do item</DialogTitle>
          </DialogHeader>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
            {descricaoCompleta}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescricaoCompleta(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
