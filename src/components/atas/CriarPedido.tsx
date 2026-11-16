import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, ArrowRight, FileText, FileUp, Loader2, Printer, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extrairItensPdf, type ItemImportado } from "@/lib/importar.functions";
import type { Json, Tables } from "@/integrations/supabase/types";
import { brl } from "@/lib/vencimento";

type Ata = Tables<"atas">;
type ItemAta = Tables<"ata_itens">;
type Etapa = "ata" | "saldo" | "itens" | "justificativa" | "visualizacao";

type LinhaPedido = ItemImportado & {
  chave: string;
  ataItemId: string | null;
  selecionado: boolean;
  quantidadePedido: number;
};

function chaveCodigo(valor: string | null | undefined) {
  return (valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");
}

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBR(valor: string) {
  return valor.split("-").reverse().join("/");
}

function escaparHtml(valor: string) {
  const entidades: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return valor.replace(/[&<>"']/g, (c) => entidades[c] ?? c);
}

export function CriarPedido({
  aberto,
  onFechar,
  atas,
  onPedidoSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  atas: Ata[];
  onPedidoSalvo?: () => void;
}) {
  const extrairPdf = useServerFn(extrairItensPdf);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>("ata");
  const [ataId, setAtaId] = useState("");
  const [itensAta, setItensAta] = useState<ItemAta[]>([]);
  const [linhas, setLinhas] = useState<LinhaPedido[]>([]);
  const [buscaDescricao, setBuscaDescricao] = useState("");
  const [dataRelatorio, setDataRelatorio] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [lendoPdf, setLendoPdf] = useState(false);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [salvandoPedido, setSalvandoPedido] = useState(false);

  const ataSelecionada = atas.find((ata) => ata.id === ataId);
  const linhasFiltradas = useMemo(() => {
    const termo = buscaDescricao
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
    if (!termo) return linhas;
    return linhas.filter((linha) =>
      linha.descricao
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .includes(termo),
    );
  }, [linhas, buscaDescricao]);
  const escolhidas = useMemo(() => linhas.filter((linha) => linha.selecionado && linha.quantidadePedido > 0), [linhas]);
  const totalPedido = useMemo(
    () => escolhidas.reduce((total, linha) => total + linha.quantidadePedido * linha.preco_unitario, 0),
    [escolhidas],
  );
  const fornecedores = useMemo(() => {
    const grupos = new Map<string, LinhaPedido[]>();
    for (const linha of escolhidas) {
      const fornecedor = linha.fornecedor.trim() || "FORNECEDOR NÃO INFORMADO";
      const grupo = grupos.get(fornecedor) ?? [];
      grupo.push(linha);
      grupos.set(fornecedor, grupo);
    }
    return [...grupos.entries()];
  }, [escolhidas]);

  function reiniciar() {
    setEtapa("ata");
    setAtaId("");
    setItensAta([]);
    setLinhas([]);
    setBuscaDescricao("");
    setDataRelatorio("");
    setNomeArquivo("");
    setJustificativa("");
    setLendoPdf(false);
    setCarregandoItens(false);
    if (inputArquivo.current) inputArquivo.current.value = "";
  }

  function fechar() {
    reiniciar();
    onFechar();
  }

  async function avancarAta() {
    if (!ataId) {
      toast.error("Selecione uma ata vigente.");
      return;
    }
    setCarregandoItens(true);
    const { data, error } = await supabase
      .from("ata_itens")
      .select("*")
      .eq("ata_id", ataId)
      .order("codigo_item", { ascending: true });
    setCarregandoItens(false);
    if (error) {
      toast.error("Não foi possível carregar os itens da ata: " + error.message);
      return;
    }
    if (!data?.length) {
      toast.error("Esta ata ainda não possui itens cadastrados. Cadastre os itens antes de criar o pedido.");
      return;
    }
    setItensAta(data);
    setEtapa("saldo");
  }

  async function lerArquivo(arquivo: File) {
    if (!arquivo.name.toLowerCase().endsWith(".pdf") && arquivo.type !== "application/pdf") {
      toast.error("Para conferir o saldo, envie o relatório em PDF.");
      return;
    }
    if (arquivo.size === 0) {
      toast.error("O arquivo selecionado está vazio (0 bytes). Baixe/salve o PDF completo no computador e selecione-o novamente.");
      return;
    }
    if (arquivo.size > 10 * 1024 * 1024) {
      toast.error("O PDF ultrapassa o limite de 10 MB.");
      return;
    }
    setLendoPdf(true);
    setNomeArquivo(arquivo.name);
    setLinhas([]);
    try {
      // FileReader fornece leitura compatível também com arquivos selecionados
      // em pastas sincronizadas ou disponibilizados sob demanda pelo sistema.
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => {
          if (!(leitor.result instanceof ArrayBuffer)) {
            reject(new Error("O navegador não retornou os dados binários do PDF."));
            return;
          }
          resolve(new Uint8Array(leitor.result));
        };
        leitor.onerror = () => reject(new Error("O navegador não conseguiu ler o arquivo selecionado."));
        leitor.onabort = () => reject(new Error("A leitura do arquivo foi cancelada."));
        leitor.readAsArrayBuffer(arquivo);
      });
      if (bytes.length === 0) {
        throw new Error(`O navegador leu 0 bytes do arquivo "${arquivo.name}". Baixe o PDF para o computador antes de anexá-lo.`);
      }
      if (bytes.length !== arquivo.size) {
        throw new Error(`Leitura incompleta: o arquivo tem ${arquivo.size.toLocaleString("pt-BR")} bytes, mas o navegador conseguiu ler ${bytes.length.toLocaleString("pt-BR")} bytes. Baixe o PDF localmente e tente novamente.`);
      }
      let binario = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const base64 = btoa(binario);
      if (!base64) {
        throw new Error("Não foi possível converter o PDF para envio. Selecione uma cópia salva localmente.");
      }
      const resposta = await extrairPdf({ data: { base64, exigirDataAtual: true } });
      if (resposta.erro) {
        toast.error(resposta.erro);
        setNomeArquivo("");
        return;
      }
      if (!resposta.dataRelatorio) {
        toast.error("Não foi possível confirmar a data que consta na última página do PDF.");
        setNomeArquivo("");
        return;
      }

      const usados = new Set<string>();
      const linhasLidas = resposta.itens.map((item, indice): LinhaPedido => {
        const codigoItem = chaveCodigo(item.codigo_item);
        const codigoProduto = chaveCodigo(item.codigo_produto);
        const descricao = chaveCodigo(item.descricao);
        const fornecedor = chaveCodigo(item.fornecedor);
        const mesmoFornecedor = (existente: ItemAta) =>
          !fornecedor || !existente.fornecedor || chaveCodigo(existente.fornecedor) === fornecedor;
        let candidatos = codigoItem
          ? itensAta.filter((existente) => chaveCodigo(existente.codigo_item) === codigoItem && mesmoFornecedor(existente) && !usados.has(existente.id))
          : [];
        if (candidatos.length !== 1 && codigoProduto) {
          candidatos = itensAta.filter((existente) => chaveCodigo(existente.codigo_produto) === codigoProduto && mesmoFornecedor(existente) && !usados.has(existente.id));
        }
        if (candidatos.length !== 1 && descricao) {
          candidatos = itensAta.filter((existente) => chaveCodigo(existente.descricao) === descricao && mesmoFornecedor(existente) && !usados.has(existente.id));
        }
        const correspondencia = candidatos.length === 1 ? candidatos[0] : undefined;
        if (correspondencia) usados.add(correspondencia.id);

        return {
          ...item,
          chave: `${codigoItem || codigoProduto || chaveCodigo(item.descricao)}-${indice}`,
          ataItemId: correspondencia?.id ?? null,
          selecionado: false,
          quantidadePedido: 0,
        };
      });

      if (!linhasLidas.length) {
        toast.error("O relatório atual não contém itens reconhecidos.");
        setNomeArquivo("");
        return;
      }

      const saldosParaAtualizar = linhasLidas
        .filter((linha) => linha.ataItemId)
        .map((linha) => ({ item_id: linha.ataItemId!, saldo: linha.quantidade }));
      if (saldosParaAtualizar.length === 0) {
        toast.error("Nenhum item do PDF foi vinculado aos itens cadastrados nesta ata. Confira se selecionou a ata correta e se os códigos/descrições dos itens estão cadastrados antes de continuar.");
        setNomeArquivo("");
        return;
      }
      if (saldosParaAtualizar.length > 0) {
        const { error: erroSaldo } = await supabase.rpc("atualizar_saldos_ata", {
          p_ata_id: ataId,
          p_data_relatorio: resposta.dataRelatorio,
          p_saldos: saldosParaAtualizar,
        });
        if (erroSaldo) {
          toast.error("O PDF é válido, mas não foi possível gravar os saldos no cadastro da ata: " + erroSaldo.message);
          setNomeArquivo("");
          return;
        }
      }

      setDataRelatorio(resposta.dataRelatorio);
      setLinhas(linhasLidas);
      setBuscaDescricao("");
      setEtapa("itens");
      const semCorrespondencia = linhasLidas.length - saldosParaAtualizar.length;
      if (semCorrespondencia > 0) {
        toast.warning(`${semCorrespondencia} item(ns) do PDF não foram vinculados ao cadastro interno; o saldo desses itens será usado apenas nesta montagem de pedido.`);
      } else {
        toast.success(`PDF validado em ${dataBR(resposta.dataRelatorio)}. Saldos atualizados no sistema.`);
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro inesperado ao ler o arquivo.";
      toast.error(mensagem);
      setNomeArquivo("");
    } finally {
      setLendoPdf(false);
      if (inputArquivo.current) inputArquivo.current.value = "";
    }
  }

  function atualizarLinha(chave: string, valores: Partial<Pick<LinhaPedido, "selecionado" | "quantidadePedido">>) {
    setLinhas((atuais) => atuais.map((linha) => {
      if (linha.chave !== chave) return linha;
      const quantidadePedido = valores.quantidadePedido ?? linha.quantidadePedido;
      const selecionado = valores.selecionado ?? (valores.quantidadePedido !== undefined ? quantidadePedido > 0 : linha.selecionado);
      return { ...linha, ...valores, selecionado, quantidadePedido };
    }));
  }

  function avancarItens() {
    if (!escolhidas.length) {
      toast.error("Selecione pelo menos um item para compor o pedido.");
      return;
    }
    const invalido = escolhidas.find((linha) =>
      !Number.isFinite(linha.quantidadePedido) ||
      linha.quantidadePedido <= 0 ||
      linha.quantidadePedido > linha.quantidade,
    );
    if (invalido) {
      toast.error(`A quantidade do item ${invalido.codigo_item || invalido.descricao} ultrapassa o saldo disponível.`);
      return;
    }
    setEtapa("justificativa");
  }

  function avancarJustificativa() {
    if (!justificativa.trim()) {
      toast.error("Informe a justificativa do pedido.");
      return;
    }
    setEtapa("visualizacao");
  }

  async function gerarPdf() {
    if (!ataSelecionada || !escolhidas.length || !justificativa.trim() || salvandoPedido) return;
    const janela = window.open("", "_blank");
    if (!janela) {
      toast.error("O navegador bloqueou a janela do pedido. Permita pop-ups para este sistema.");
      return;
    }
    setSalvandoPedido(true);
    const { data: usuarioAtual, error: erroUsuario } = await supabase.auth.getUser();
    if (erroUsuario || !usuarioAtual.user) {
      janela.close();
      setSalvandoPedido(false);
      toast.error("Sua sessão expirou. Entre novamente para salvar o pedido.");
      return;
    }
    const itensSnapshot = escolhidas.map((linha) => ({
      codigo_item: linha.codigo_item || linha.codigo_produto || "",
      descricao: linha.descricao,
      fornecedor: linha.fornecedor,
      unidade: linha.unidade,
      quantidade: linha.quantidadePedido,
      preco_unitario: linha.preco_unitario,
      valor_total: linha.quantidadePedido * linha.preco_unitario,
    }));
    const { error: erroPedido } = await supabase.from("pedidos").insert({
      user_id: usuarioAtual.user.id,
      setor_id: ataSelecionada.setor_id,
      ata_id: ataSelecionada.id,
      justificativa: justificativa.trim(),
      itens: itensSnapshot as unknown as Json,
      total: totalPedido,
      data_saldo: dataRelatorio,
    });
    if (erroPedido) {
      janela.close();
      setSalvandoPedido(false);
      toast.error("Não foi possível salvar o pedido: " + erroPedido.message);
      return;
    }
    onPedidoSalvo?.();
    const dataHoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const blocosFornecedor = fornecedores.map(([nome, itens]) => `
      <h3>FORNECEDOR: ${escaparHtml(nome)}</h3>
      <table>
        <thead><tr><th>COD. DO ITEM</th><th>DESCRIÇÃO RESUMIDA</th><th>QUANTIDADE</th><th>VALOR UNITÁRIO</th><th>VALOR TOTAL</th></tr></thead>
        <tbody>${itens.map((linha) => `
          <tr>
            <td>${escaparHtml(linha.codigo_item || linha.codigo_produto || "—")}</td>
            <td>${escaparHtml(linha.descricao)}</td>
            <td class="numero">${linha.quantidadePedido.toLocaleString("pt-BR")}</td>
            <td class="numero">${moeda(linha.preco_unitario)}</td>
            <td class="numero">${moeda(linha.quantidadePedido * linha.preco_unitario)}</td>
          </tr>`).join("")}
        </tbody>
      </table>`).join("");

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido_Ata_${escaparHtml(ataSelecionada.numero || "vigente")}_${dataHoje.replace(/\//g, "-")}</title>
      <style>
        @page { size: A4; margin: 18mm 15mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11pt; }
        .abertura { margin-bottom: 15px; }
        .justificativa { margin: 0 0 22px; white-space: pre-wrap; line-height: 1.45; }
        h3 { margin: 18px 0 7px; font-size: 10pt; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; table-layout: fixed; }
        th, td { border: 1px solid #555; padding: 6px 5px; font-size: 9pt; vertical-align: top; overflow-wrap: anywhere; }
        th { background: #f0f0f0; text-align: left; }
        th:nth-child(1) { width: 12%; } th:nth-child(2) { width: 38%; } th:nth-child(3) { width: 13%; } th:nth-child(4) { width: 17%; } th:nth-child(5) { width: 20%; }
        .numero { text-align: right; white-space: nowrap; }
        .total { margin-top: 14px; text-align: right; font-weight: bold; }
      </style></head><body>
      <p class="abertura">Prezados,</p>
      <p class="justificativa">${escaparHtml(justificativa.trim())}</p>
      ${blocosFornecedor}
      <p class="total">VALOR TOTAL DO PEDIDO: ${moeda(totalPedido)}</p>
      </body></html>`;

    janela.document.open();
    janela.document.write(html);
    janela.document.close();
    janela.focus();
    janela.print();
    setSalvandoPedido(false);
    toast.success("Pedido salvo na guia Pedidos. O PDF está pronto para impressão ou salvamento.");
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Criar pedido a partir de ata vigente</DialogTitle>
          <p className="text-sm text-muted-foreground">Etapa {(["ata", "saldo", "itens", "justificativa", "visualizacao"] as Etapa[]).indexOf(etapa) + 1} de 5</p>
        </DialogHeader>

        {etapa === "ata" && (
          <div className="space-y-4">
            <p className="text-sm">Selecione a ata de registro de preços que será utilizada para montar o pedido.</p>
            <label className="block space-y-1.5 text-sm font-medium">
              Ata vigente
              <select className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm font-normal" value={ataId} onChange={(e) => {
                setAtaId(e.target.value);
                setItensAta([]);
                setLinhas([]);
                setDataRelatorio("");
                setNomeArquivo("");
                setJustificativa("");
              }}>
                <option value="">Selecione uma ata...</option>
                {atas.map((ata) => <option key={ata.id} value={ata.id}>Ata {ata.numero || "—"} · {ata.objeto}</option>)}
              </select>
            </label>
            {ataSelecionada && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="font-semibold">Ata {ataSelecionada.numero}</div>
                <div className="mt-1 text-muted-foreground">{ataSelecionada.objeto}</div>
              </div>
            )}
            {atas.length === 0 && <p className="text-sm text-muted-foreground">Não há atas vigentes disponíveis para pedido.</p>}
          </div>
        )}

        {etapa === "saldo" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-semibold">Ata {ataSelecionada?.numero}</div>
              <div className="mt-1 text-muted-foreground">{ataSelecionada?.objeto}</div>
            </div>
            <div className="rounded-lg border border-dashed p-6 text-center">
              <FileUp className="mx-auto mb-2 h-8 w-8 text-primary" />
              <div className="font-medium">Anexe o relatório de saldo atualizado da ata</div>
              <p className="mt-1 text-sm text-muted-foreground">PDF do JL Soft com a coluna “Qtd. Saldo” e a data de emissão na última página. O arquivo precisa ter sido gerado hoje.</p>
              <input
                ref={inputArquivo}
                type="file"
                accept="application/pdf,.pdf"
                className="mt-4 block max-w-full text-sm"
                disabled={lendoPdf}
                onChange={(e) => { const arquivo = e.target.files?.[0]; if (arquivo) void lerArquivo(arquivo); }}
              />
              {lendoPdf && <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo PDF e conferindo a data da última página...</div>}
            </div>
            <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p>O sistema recusará automaticamente qualquer relatório sem data legível ou emitido em dia diferente de hoje. O saldo da ata só será atualizado após essa validação.</p>
            </div>
            {nomeArquivo && <p className="text-xs text-muted-foreground">Arquivo selecionado: {nomeArquivo}</p>}
          </div>
        )}

        {etapa === "itens" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <div><strong>Relatório validado:</strong> {dataBR(dataRelatorio)}</div>
              <div className="text-muted-foreground">{linhas.length} item(ns) lido(s) · saldo registrado no sistema para {linhas.filter((l) => l.ataItemId).length} item(ns) do cadastro</div>
            </div>
            <p className="text-sm text-muted-foreground">Marque os itens que farão parte do pedido e informe a quantidade. O sistema não permitirá quantidade superior à coluna “Qtd. Saldo”.</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={buscaDescricao}
                  onChange={(e) => setBuscaDescricao(e.target.value)}
                  placeholder="Pesquisar item pela descrição..."
                  aria-label="Pesquisar item pela descrição"
                  className="pl-9 pr-10"
                />
                {buscaDescricao && (
                  <button
                    type="button"
                    onClick={() => setBuscaDescricao("")}
                    aria-label="Limpar pesquisa"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {buscaDescricao.trim()
                  ? `${linhasFiltradas.length} de ${linhas.length} item(ns)`
                  : `${linhas.length} item(ns)`}
              </span>
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="p-2">Selecionar</th><th className="p-2">Fornecedor</th><th className="p-2">Cód. item</th><th className="p-2">Descrição</th><th className="p-2 text-right">Qtd. Saldo</th><th className="p-2 text-right">Qtd. pedido</th><th className="p-2 text-right">Valor unitário</th><th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map((linha) => (
                    <tr key={linha.chave} className="border-t">
                      <td className="p-2"><input type="checkbox" checked={linha.selecionado} onChange={(e) => atualizarLinha(linha.chave, { selecionado: e.target.checked, quantidadePedido: e.target.checked ? (linha.quantidade >= 1 ? 1 : linha.quantidade) : 0 })} aria-label={`Selecionar item ${linha.codigo_item}`} /></td>
                      <td className="p-2">{linha.fornecedor}</td>
                      <td className="p-2">{linha.codigo_item || linha.codigo_produto}</td>
                      <td className="p-2 whitespace-normal">{linha.descricao}</td>
                      <td className="p-2 text-right tabular-nums">{linha.quantidade.toLocaleString("pt-BR")}</td>
                      <td className="w-28 p-2"><Input type="number" min="0" max={linha.quantidade} step="0.001" value={linha.quantidadePedido || ""} disabled={!linha.selecionado} onChange={(e) => atualizarLinha(linha.chave, { quantidadePedido: Number(e.target.value) })} /></td>
                      <td className="p-2 text-right tabular-nums">{moeda(linha.preco_unitario)}</td>
                      <td className="p-2 text-right tabular-nums">{moeda(linha.selecionado ? linha.quantidadePedido * linha.preco_unitario : 0)}</td>
                    </tr>
                  ))}
                  {linhasFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">
                        Nenhum item encontrado para “{buscaDescricao}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="text-right font-semibold">Total parcial: {brl(totalPedido)}</div>
          </div>
        )}

        {etapa === "justificativa" && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div><strong>Ata:</strong> {ataSelecionada?.numero}</div>
              <div><strong>Itens selecionados:</strong> {escolhidas.length}</div>
              <div><strong>Total:</strong> {brl(totalPedido)}</div>
              <div><strong>Saldo consultado em:</strong> {dataBR(dataRelatorio)}</div>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              Justificativa do pedido
              <Textarea rows={5} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Descreva a necessidade e a finalidade do pedido..." />
            </label>
          </div>
        )}

        {etapa === "visualizacao" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-5 text-sm">
              <p className="mb-3">Prezados,</p>
              <p className="mb-5 whitespace-pre-wrap">{justificativa}</p>
              {fornecedores.map(([fornecedor, itens]) => (
                <div key={fornecedor} className="mb-5">
                  <div className="mb-2 font-semibold">FORNECEDOR: {fornecedor}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[650px] border-collapse text-xs">
                      <thead><tr className="bg-muted">
                        <th className="border p-2 text-left">COD. DO ITEM</th><th className="border p-2 text-left">DESCRIÇÃO RESUMIDA</th><th className="border p-2 text-right">QUANTIDADE</th><th className="border p-2 text-right">VALOR UNITÁRIO</th><th className="border p-2 text-right">VALOR TOTAL</th>
                      </tr></thead>
                      <tbody>{itens.map((linha) => (
                        <tr key={linha.chave}>
                          <td className="border p-2">{linha.codigo_item || linha.codigo_produto || "—"}</td>
                          <td className="border p-2">{linha.descricao}</td>
                          <td className="border p-2 text-right">{linha.quantidadePedido.toLocaleString("pt-BR")}</td>
                          <td className="border p-2 text-right">{brl(linha.preco_unitario)}</td>
                          <td className="border p-2 text-right">{brl(linha.quantidadePedido * linha.preco_unitario)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              ))}
              <div className="border-t pt-3 text-right font-bold">VALOR TOTAL DO PEDIDO: {brl(totalPedido)}</div>
            </div>
            <p className="text-xs text-muted-foreground">Ao gerar, será aberta a janela de impressão do navegador. Escolha “Salvar como PDF” como destino para salvar o documento.</p>
          </div>
        )}

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {etapa !== "ata" && <Button type="button" variant="outline" onClick={() => setEtapa(etapa === "saldo" ? "ata" : etapa === "itens" ? "saldo" : etapa === "justificativa" ? "itens" : "justificativa")}><ArrowLeft className="h-4 w-4" /> Voltar</Button>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
            {etapa === "ata" && <Button type="button" onClick={() => void avancarAta()} disabled={!ataId || carregandoItens}>{carregandoItens ? <><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</> : <>Continuar <ArrowRight className="h-4 w-4" /></>}</Button>}
            {etapa === "itens" && <Button type="button" onClick={avancarItens}>Continuar <ArrowRight className="h-4 w-4" /></Button>}
            {etapa === "justificativa" && <Button type="button" onClick={avancarJustificativa}>Visualizar pedido <ArrowRight className="h-4 w-4" /></Button>}
            {etapa === "visualizacao" && <Button type="button" onClick={() => void gerarPdf()} disabled={salvandoPedido}><Printer className="h-4 w-4" /> {salvandoPedido ? "Salvando pedido..." : "Salvar pedido e gerar PDF"}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
