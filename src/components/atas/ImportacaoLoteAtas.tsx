import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { DadosAtaExtraidos, ItemImportado } from "@/lib/importacao-ata";
import { extrairDadosAtaPdf } from "@/lib/importar.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { brl } from "@/lib/vencimento";

type Setor = Tables<"setores">;
type Classe = Tables<"classificacoes">;
type StatusLinha = "analisando" | "pronta" | "salvando" | "sucesso" | "erro";

type RascunhoAta = {
  id: string;
  arquivo: File;
  numero: string;
  processo: string;
  objeto: string;
  data_homologacao: string;
  data_vencimento: string;
  pregao: string;
  setor_id: string;
  classificacao_id: string;
  memorando_1doc: string;
  processo_1doc: string;
  itens: ItemImportado[];
  camposEncontrados: string[];
  avisoItens?: string | undefined;
  erro?: string;
  status: StatusLinha;
  resultado?: string | undefined;
};

async function lerPdfBase64(arquivo: File): Promise<string> {
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
  if (!bytes.length || bytes.length !== arquivo.size) {
    throw new Error("A leitura do PDF ficou incompleta. Salve uma cópia local do arquivo e tente novamente.");
  }
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

function nomeSeguro(nome: string) {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "ata.pdf";
}

function validarRascunho(ata: RascunhoAta): string[] {
  const faltas: string[] = [];
  if (ata.erro) faltas.push("PDF não analisado");
  if (!ata.numero.trim()) faltas.push("número da ata");
  if (!ata.objeto.trim()) faltas.push("objeto");
  if (!ata.data_vencimento) faltas.push("Data Fim/vencimento");
  if (!ata.classificacao_id) faltas.push("classificação");
  if (!ata.setor_id) faltas.push("setor");
  if (!ata.memorando_1doc.trim()) faltas.push("Memorando 1Doc");
  if (!ata.processo_1doc.trim()) faltas.push("Processo Administrativo 1Doc");
  if (ata.itens.length === 0) faltas.push("itens identificados no PDF");
  if (ata.itens.some((item) =>
    !item.descricao.trim() ||
    !item.unidade.trim() ||
    !Number.isFinite(item.quantidade) ||
    item.quantidade <= 0 ||
    !Number.isFinite(item.preco_unitario) ||
    item.preco_unitario < 0
  )) faltas.push("itens com dados inválidos");
  return faltas;
}

export function ImportacaoLoteAtas() {
  const qc = useQueryClient();
  const extrair = useServerFn(extrairDadosAtaPdf);
  const inputRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [rascunhos, setRascunhos] = useState<RascunhoAta[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [novaClassePorAta, setNovaClassePorAta] = useState<Record<string, string>>({});

  const setoresQ = useQuery({
    queryKey: ["setores-importacao-lote"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
    enabled: aberto,
  });
  const classesQ = useQuery({
    queryKey: ["classificacoes-importacao-lote"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classificacoes").select("*").order("nome");
      if (error) throw error;
      return data;
    },
    enabled: aberto,
  });

  const prontas = useMemo(
    () => rascunhos.filter((ata) => !ata.erro && validarRascunho(ata).length === 0 && ata.status !== "sucesso"),
    [rascunhos],
  );
  const concluidas = rascunhos.filter((ata) => ata.status === "sucesso").length;

  function atualizar(id: string, alteracoes: Partial<RascunhoAta>) {
    setRascunhos((atuais) => atuais.map((ata) => ata.id === id ? { ...ata, ...alteracoes } : ata));
  }

  async function analisarArquivos(arquivos: FileList | File[] | null) {
    const selecionados = Array.from(arquivos ?? []);
    if (!selecionados.length) return;
    if (rascunhos.length + selecionados.length > 20) {
      toast.error("O limite é de 20 atas por lote. Remova alguns arquivos ou conclua este lote antes de adicionar mais.");
      return;
    }
    const aceitos = selecionados.filter((arquivo) => {
      const pdf = arquivo.type === "application/pdf" || arquivo.name.toLowerCase().endsWith(".pdf");
      if (!pdf) toast.error(arquivo.name + ": selecione somente arquivos PDF.");
      else if (!arquivo.size || arquivo.size > 10 * 1024 * 1024) toast.error(arquivo.name + ": arquivo vazio ou acima de 10 MB.");
      return pdf && arquivo.size > 0 && arquivo.size <= 10 * 1024 * 1024;
    });
    if (!aceitos.length) return;

    setAnalisando(true);
    for (const arquivo of aceitos) {
      const id = crypto.randomUUID();
      const setorInicial = setoresQ.data?.[0]?.id ?? "";
      const base: RascunhoAta = {
        id, arquivo, numero: "", processo: "", objeto: "", data_homologacao: "", data_vencimento: "",
        pregao: "", setor_id: setorInicial, classificacao_id: "", memorando_1doc: "", processo_1doc: "",
        itens: [], camposEncontrados: [], status: "analisando",
      };
      setRascunhos((atuais) => [...atuais, base]);

      try {
        const base64 = await lerPdfBase64(arquivo);
        const resposta = await extrair({ data: { base64 } });
        if (resposta.erro) {
          atualizar(id, { erro: resposta.erro, status: "erro" });
          continue;
        }
        const dados: DadosAtaExtraidos = resposta.dados;
        atualizar(id, {
          numero: dados.numero ?? "",
          processo: dados.processo ?? "",
          objeto: dados.objeto ?? "",
          data_homologacao: dados.data_homologacao ?? "",
          data_vencimento: dados.data_vencimento ?? "",
          pregao: dados.pregao ?? "",
          itens: resposta.itens ?? [],
          camposEncontrados: resposta.camposEncontrados ?? [],
          avisoItens: resposta.avisoItens,
          status: "pronta",
        });
      } catch (erro) {
        atualizar(id, {
          erro: erro instanceof Error ? erro.message : "Erro inesperado ao analisar o PDF.",
          status: "erro",
        });
      }
    }
    setAnalisando(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remover(id: string) {
    setRascunhos((atuais) => atuais.filter((ata) => ata.id !== id));
    setNovaClassePorAta((atuais) => {
      const novas = { ...atuais };
      delete novas[id];
      return novas;
    });
  }

  async function adicionarClassificacao(ata: RascunhoAta) {
    const nome = (novaClassePorAta[ata.id] ?? "").trim();
    if (!nome || !ata.setor_id) {
      toast.error("Informe o nome da classificação e selecione o setor.");
      return;
    }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      toast.error("Sua sessão expirou. Entre novamente.");
      return;
    }
    const { data, error } = await supabase.from("classificacoes").insert({
      nome,
      setor_id: ata.setor_id,
      user_id: authData.user.id,
    }).select("id").single();
    if (error || !data) {
      toast.error(error?.code === "23505" ? "Essa classificação já existe neste setor." : error?.message ?? "Não foi possível criar a classificação.");
      return;
    }
    await classesQ.refetch();
    atualizar(ata.id, { classificacao_id: data.id });
    setNovaClassePorAta((atuais) => ({ ...atuais, [ata.id]: "" }));
    toast.success("Classificação criada para o setor selecionado.");
  }

  async function salvarUm(ata: RascunhoAta) {
    const faltas = validarRascunho(ata);
    if (faltas.length) throw new Error("Preencha: " + faltas.join(", ") + ".");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");

    const { data: duplicada, error: duplicadaError } = await supabase
      .from("atas").select("id").eq("numero", ata.numero.trim()).eq("setor_id", ata.setor_id).limit(1).maybeSingle();
    if (duplicadaError) throw new Error("Não foi possível conferir duplicidade: " + duplicadaError.message);
    if (duplicada) throw new Error("Já existe uma ata com o número " + ata.numero + " neste setor.");

    const fornecedores = [...new Set(ata.itens.map((item) => item.fornecedor.trim()).filter(Boolean))];
    const { data: criada, error: criarError } = await supabase.from("atas").insert({
      user_id: authData.user.id,
      setor_id: ata.setor_id,
      numero: ata.numero.trim(),
      processo: ata.processo.trim() || null,
      objeto: ata.objeto.trim(),
      data_homologacao: ata.data_homologacao || null,
      data_vencimento: ata.data_vencimento,
      dias_alerta: 90,
      observacoes: null,
      pregao: ata.pregao.trim() || null,
      memorando_1doc: ata.memorando_1doc.trim(),
      processo_1doc: ata.processo_1doc.trim(),
      fase_processo: null,
      numero_edital_bll: null,
      classificacao_id: ata.classificacao_id,
      situacao_cadastro: "Vigentes",
      fornecedor: fornecedores.join(", ") || null,
    }).select("id").single();
    if (criarError || !criada) throw new Error(criarError?.message ?? "Não foi possível criar a ata.");

    const limparAtaCriada = async () => {
      await supabase.from("ata_itens").delete().eq("ata_id", criada.id);
      await supabase.from("anexos").delete().eq("ref_tipo", "ata").eq("ref_id", criada.id);
      await supabase.from("atas").delete().eq("id", criada.id);
    };

    const { error: itensError } = await supabase.from("ata_itens").insert(
      ata.itens.map((item) => ({
        ata_id: criada.id,
        codigo_item: item.codigo_item || null,
        codigo_produto: item.codigo_produto || null,
        descricao: item.descricao.trim(),
        fornecedor: item.fornecedor.trim() || null,
        unidade: item.unidade.trim(),
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
      })),
    );
    if (itensError) {
      await limparAtaCriada();
      throw new Error("Falha ao gravar itens: " + itensError.message);
    }

    const caminho = "ata/" + criada.id + "/" + Date.now() + "_" + nomeSeguro(ata.arquivo.name);
    const upload = await supabase.storage.from("anexos").upload(caminho, ata.arquivo);
    if (upload.error) {
      await limparAtaCriada();
      throw new Error("Falha ao armazenar o PDF original: " + upload.error.message);
    }

    const { error: anexoError } = await supabase.from("anexos").insert({
      ref_tipo: "ata", ref_id: criada.id, tipo_doc: "Ata de Registro de Preços", nome: ata.arquivo.name, caminho,
    });
    if (anexoError) {
      await supabase.storage.from("anexos").remove([caminho]);
      await limparAtaCriada();
      throw new Error("Falha ao registrar o anexo: " + anexoError.message);
    }
    return criada.id;
  }

  async function salvarLote() {
    const candidatos = rascunhos.filter((ata) => !ata.erro && ata.status !== "sucesso");
    const validos = candidatos.filter((ata) => validarRascunho(ata).length === 0);
    if (!validos.length) {
      toast.error("Não há atas completas para importar. Confira os campos obrigatórios e os itens de cada PDF.");
      return;
    }
    setSalvandoLote(true);
    let sucessos = 0;
    const falhas: string[] = [];
    for (const ata of validos) {
      atualizar(ata.id, { status: "salvando", resultado: undefined });
      try {
        await salvarUm(ata);
        atualizar(ata.id, { status: "sucesso", resultado: "Ata e itens importados." });
        sucessos += 1;
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : "Falha inesperada.";
        atualizar(ata.id, { status: "erro", resultado: mensagem });
        falhas.push(ata.arquivo.name + ": " + mensagem);
      }
    }
    setSalvandoLote(false);
    await qc.invalidateQueries({ queryKey: ["atas"] });
    await qc.invalidateQueries({ queryKey: ["totais"] });
    if (falhas.length) toast.warning(sucessos + " ata(s) importada(s); " + falhas.length + " falha(s). Confira os detalhes no lote.");
    else toast.success(sucessos + " ata(s) importada(s), com itens e PDF anexado.");
  }

  function fechar() {
    if (analisando || salvandoLote) return;
    setAberto(false);
    setRascunhos([]);
  }

  const setores = setoresQ.data ?? [];
  const classes = classesQ.data ?? [];

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Upload className="h-4 w-4" /> Importar várias atas
      </Button>
      <Dialog open={aberto} onOpenChange={(open) => { if (!open) fechar(); else setAberto(true); }}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileUp className="h-5 w-5" /> Importação em lote de Atas de Registro de Preços</DialogTitle>
            <p className="text-sm text-muted-foreground">Selecione até 20 PDFs. O sistema analisará cada arquivo, extrairá os dados e os itens, permitirá a revisão e salvará as atas válidas individualmente.</p>
          </DialogHeader>

          <div className="rounded-lg border border-dashed p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">Selecionar arquivos PDF</div>
                <p className="text-xs text-muted-foreground">Até 20 arquivos por lote; limite de 10 MB por PDF. A classificação e os números do 1Doc são preenchidos na revisão.</p>
              </div>
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" disabled={analisando || salvandoLote} onChange={(e) => void analisarArquivos(e.target.files)} />
              <Button type="button" variant="outline" disabled={analisando || salvandoLote || rascunhos.length >= 20} onClick={() => inputRef.current?.click()}>
                {analisando ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando PDFs...</> : <><Plus className="h-4 w-4" /> Adicionar PDFs</>}
              </Button>
            </div>
            {setoresQ.isLoading && <p className="mt-3 text-xs text-muted-foreground">Carregando setores...</p>}
            {classesQ.isError && <p className="mt-3 text-xs text-destructive">Não foi possível carregar as classificações.</p>}
          </div>

          {rascunhos.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{rascunhos.length} PDF(s)</Badge>
                  <Badge variant="outline">{prontas.length} pronto(s) para importar</Badge>
                  <Badge variant="outline">{concluidas} importado(s)</Badge>
                </div>
                <span className="text-xs text-muted-foreground">Cada ata é gravada separadamente; falhas em um PDF não cancelam os demais.</span>
              </div>

              <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                {rascunhos.map((ata, index) => {
                  const faltas = validarRascunho(ata);
                  const classesDoSetor = classes.filter((classe) => classe.setor_id === ata.setor_id);
                  return (
                    <div key={ata.id} className="space-y-3 rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">{index + 1}. {ata.arquivo.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            {ata.status === "analisando" && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Analisando</Badge>}
                            {ata.status === "salvando" && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Salvando</Badge>}
                            {ata.status === "sucesso" && <Badge><CheckCircle2 className="mr-1 h-3 w-3" /> Importada</Badge>}
                            {ata.status === "erro" && <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" /> Verificar</Badge>}
                            {ata.status === "pronta" && <Badge variant="secondary">Analisada</Badge>}
                            <span className="text-muted-foreground">{ata.itens.length} item(ns) extraído(s)</span>
                          </div>
                        </div>
                        {ata.status !== "sucesso" && !salvandoLote && <Button type="button" variant="ghost" size="icon" onClick={() => remover(ata.id)} aria-label="Remover PDF do lote"><Trash2 className="h-4 w-4" /></Button>}
                      </div>

                      {ata.erro && <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{ata.erro}</p>}
                      {ata.avisoItens && <p className="rounded-md bg-warning/10 p-2 text-xs">{ata.avisoItens}</p>}
                      {ata.resultado && <p className={ata.status === "sucesso" ? "rounded-md bg-success/10 p-2 text-xs text-success" : "rounded-md bg-destructive/10 p-2 text-xs text-destructive"}>{ata.resultado}</p>}

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1"><Label>Nº da Ata *</Label><Input value={ata.numero} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { numero: e.target.value })} /></div>
                        <div className="space-y-1"><Label>Nº do processo</Label><Input value={ata.processo} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { processo: e.target.value })} /></div>
                        <div className="space-y-1"><Label>Nº do Pregão / Sequência</Label><Input value={ata.pregao} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { pregao: e.target.value })} /></div>
                        <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>Objeto *</Label><Input value={ata.objeto} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { objeto: e.target.value })} /></div>
                        <div className="space-y-1"><Label>Data da Licitação / Homologação</Label><Input type="date" value={ata.data_homologacao} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { data_homologacao: e.target.value })} /></div>
                        <div className="space-y-1"><Label>Data Fim / Vencimento *</Label><Input type="date" value={ata.data_vencimento} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { data_vencimento: e.target.value })} /></div>
                        <div className="space-y-1"><Label>Setor *</Label>
                          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={ata.setor_id} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { setor_id: e.target.value, classificacao_id: "" })}>
                            <option value="">Selecione...</option>
                            {setores.map((setor: Setor) => <option key={setor.id} value={setor.id}>{setor.nome}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1"><Label>Classificação *</Label>
                          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={ata.classificacao_id} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { classificacao_id: e.target.value })}>
                            <option value="">Selecione...</option>
                            {classesDoSetor.map((classe: Classe) => <option key={classe.id} value={classe.id}>{classe.nome}</option>)}
                          </select>
                          {classesDoSetor.length === 0 && ata.setor_id && ata.status !== "sucesso" && (
                            <div className="flex gap-2 pt-1">
                              <Input
                                value={novaClassePorAta[ata.id] ?? ""}
                                disabled={salvandoLote}
                                onChange={(e) => setNovaClassePorAta((atuais) => ({ ...atuais, [ata.id]: e.target.value }))}
                                placeholder="Criar classificação para este setor"
                              />
                              <Button type="button" variant="outline" size="sm" disabled={salvandoLote || !(novaClassePorAta[ata.id] ?? "").trim()} onClick={() => void adicionarClassificacao(ata)}>Adicionar</Button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1"><Label>Memorando (1Doc) *</Label><Input value={ata.memorando_1doc} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { memorando_1doc: e.target.value })} placeholder="Número do memorando" /></div>
                        <div className="space-y-1"><Label>Processo Administrativo (1Doc) *</Label><Input value={ata.processo_1doc} disabled={ata.status === "sucesso" || salvandoLote} onChange={(e) => atualizar(ata.id, { processo_1doc: e.target.value })} placeholder="Número do processo" /></div>
                      </div>

                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
                          <span>Itens identificados</span>
                          <Badge variant="outline">{ata.itens.length}</Badge>
                        </div>
                        {ata.itens.length ? (
                          <div className="max-h-44 overflow-auto">
                            <table className="w-full min-w-[680px] text-xs">
                              <thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Código</th><th className="p-2">Descrição</th><th className="p-2">Unidade</th><th className="p-2 text-right">Quantidade</th><th className="p-2 text-right">Preço unitário</th><th className="p-2">Fornecedor</th></tr></thead>
                              <tbody>{ata.itens.map((item, i) => <tr key={item.codigo_item + "-" + i} className="border-t"><td className="p-2">{item.codigo_item || "—"}</td><td className="p-2">{item.descricao}</td><td className="p-2">{item.unidade}</td><td className="p-2 text-right">{item.quantidade.toLocaleString("pt-BR")}</td><td className="p-2 text-right">{brl(item.preco_unitario)}</td><td className="p-2">{item.fornecedor || "—"}</td></tr>)}</tbody>
                            </table>
                            <div className="mt-2 text-right text-xs font-semibold">Total dos itens: {brl(ata.itens.reduce((s, item) => s + item.quantidade * item.preco_unitario, 0))}</div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Nenhum item foi identificado. Este PDF não pode ser importado como ata completa.</p>
                        )}
                      </div>

                      {ata.status !== "sucesso" && faltas.length > 0 && (
                        <p className="text-xs text-muted-foreground">Para liberar a importação: {faltas.join(" · ")}.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="outline" onClick={fechar} disabled={analisando || salvandoLote}>Fechar</Button>
              {rascunhos.length > 0 && <Button variant="ghost" onClick={() => setRascunhos([])} disabled={analisando || salvandoLote}>Limpar lote</Button>}
            </div>
            <Button onClick={() => void salvarLote()} disabled={!prontas.length || analisando || salvandoLote}>
              {salvandoLote ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</> : <><Upload className="h-4 w-4" /> Importar {prontas.length} ata(s) válidas</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
