import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuthForWorker } from "@/integrations/supabase/auth-middleware-worker";
import { forwardSupabaseAccessToken } from "@/integrations/supabase/auth-client-middleware";
import { dataAtualSaoPaulo, extrairDadosAtaTexto, extrairDataRelatorioUltimaPagina, extrairItensAtaTexto, localizarCabecalhoPdf, reconstruirLinhasPdf, extrairItensDocumentoAtaTexto, type DadosAtaExtraidos, type ItemImportado } from "@/lib/importacao-ata";

export type { ItemImportado } from "@/lib/importacao-ata";



/** Extrai os dados principais de um documento de Ata de Registro de Preços. */
export const extrairDadosAtaPdf = createServerFn({ method: "POST" })
  .middleware([forwardSupabaseAccessToken, requireSupabaseAuthForWorker])
  .inputValidator((input: { base64: string }) => {
    if (typeof input?.base64 !== "string" || input.base64.length === 0 || input.base64.length > 15_000_000) {
      throw new Error("Arquivo PDF vazio, inválido ou muito grande (máx. ~10 MB).");
    }
    return input;
  })
  .handler(async ({ data }): Promise<{ dados: DadosAtaExtraidos; camposEncontrados: string[]; itens: ItemImportado[]; itensEncontrados: number; tabelaItensDetectada: boolean; avisoItens?: string; erro?: string }> => {
    let etapa = "abertura do arquivo";
    try {
      const { extractTextItems, getDocumentProxy } = await import("unpdf");
      const bytes = Uint8Array.from(atob(data.base64), (caractere) => caractere.charCodeAt(0));
      const inicioPdf = localizarCabecalhoPdf(bytes);
      if (inicioPdf < 0) {
        return { dados: {}, camposEncontrados: [], itens: [], itensEncontrados: 0, tabelaItensDetectada: false, erro: "O arquivo selecionado não contém um cabeçalho PDF válido. Selecione o documento original em PDF." };
      }

      const pdf = await getDocumentProxy(inicioPdf === 0 ? bytes : bytes.subarray(inicioPdf), { maxImageSize: 16_777_216 });
      if (pdf.numPages > 100) {
        return { dados: {}, camposEncontrados: [], itens: [], itensEncontrados: 0, tabelaItensDetectada: false, erro: "O PDF possui mais de 100 páginas. Divida o documento e tente novamente." };
      }

      etapa = "extração do texto do PDF";
      const { items: paginas } = await extractTextItems(pdf);
      if (!paginas.length || paginas.every((pagina) => pagina.length === 0)) {
        return {
          dados: {},
          camposEncontrados: [],
          itens: [],
          itensEncontrados: 0,
          tabelaItensDetectada: false,
          erro: "O PDF abriu, mas não contém texto selecionável. Envie uma versão pesquisável do documento, não uma digitalização em imagem.",
        };
      }

      etapa = "identificação dos campos da ata";
      const texto = reconstruirLinhasPdf(paginas).join("\n");
      const dadosAta = extrairDadosAtaTexto(texto);
      const camposEncontrados = Object.keys(dadosAta);
      const itens = extrairItensDocumentoAtaTexto(texto);
      const tabelaItensDetectada = /\b(?:item|itens|descri[cç][aã]o|especifica[cç][aã]o|quantidade|qtd\.?|valor\s+unit[aá]rio)\b/i.test(texto);
      const avisoItens = itens.length === 0
        ? (tabelaItensDetectada
          ? "Identifiquei indícios de tabela de itens, mas não consegui interpretar as linhas com segurança. Os itens não serão importados automaticamente para evitar cadastro incompleto ou valores incorretos."
          : "Não identifiquei uma tabela de itens neste PDF. O documento pode conter apenas o instrumento resumido; confira o PDF completo ou importe os itens manualmente.")
        : undefined;

      if (camposEncontrados.length === 0 && itens.length === 0) {
        return {
          dados: {},
          camposEncontrados: [],
          itens: [],
          itensEncontrados: 0,
          tabelaItensDetectada,
          erro: "Não identifiquei dados cadastrais nem itens neste PDF. Confira se anexou o documento completo da Ata de Registro de Preços, e não o edital ou outro relatório.",
        };
      }

      return {
        dados: dadosAta,
        camposEncontrados,
        itens,
        itensEncontrados: itens.length,
        tabelaItensDetectada,
        ...(avisoItens ? { avisoItens } : {}),
      };
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.name + ": " + erro.message : String(erro);
      console.error("extrairDadosAtaPdf - etapa:", etapa, "- erro:", detalhe, erro);
      return {
        dados: {},
        camposEncontrados: [],
        itens: [],
        itensEncontrados: 0,
        tabelaItensDetectada: false,
        erro: "Não foi possível ler a ata na etapa \"" + etapa + "\": " + detalhe.slice(0, 220) + ".",
      };
    }
  });

export const extrairItensPdf = createServerFn({ method: "POST" })
  .middleware([forwardSupabaseAccessToken, requireSupabaseAuthForWorker])
  .inputValidator((input: { base64: string; exigirDataAtual?: boolean }) => {
    if (typeof input?.base64 !== "string" || input.base64.length === 0 || input.base64.length > 15_000_000) {
      throw new Error("Arquivo PDF vazio, inválido ou muito grande (máx. ~10 MB).");
    }
    return input;
  })
  .handler(async ({ data }): Promise<{ itens: ItemImportado[]; erro?: string; dataRelatorio?: string }> => {
    let etapa = "carregamento do leitor PDF";
    try {
      const { extractTextItems, getDocumentProxy } = await import("unpdf");
      etapa = "decodificação do arquivo";
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      const inicioPdf = localizarCabecalhoPdf(bytes);
      if (inicioPdf < 0) {
        const prefixo = Array.from(bytes.subarray(0, 12), (valor) => valor.toString(16).padStart(2, "0")).join(" ");
        return {
          itens: [],
          erro: `O conteúdo recebido não contém o cabeçalho de um PDF nos primeiros 1.024 bytes. Verifique se selecionou o PDF original (arquivo recebido: ${bytes.length.toLocaleString("pt-BR")} bytes; início: ${prefixo || "vazio"}).`,
        };
      }
      etapa = "abertura do documento";
      const bytesPdf = inicioPdf === 0 ? bytes : bytes.subarray(inicioPdf);
      const pdf = await getDocumentProxy(bytesPdf, { maxImageSize: 16_777_216 });
      if (pdf.numPages > 100) {
        return { itens: [], erro: "O PDF possui mais de 100 páginas. Divida o documento e tente novamente." };
      }

      // O PDF do JL Soft posiciona os campos em colunas independentes.
      // extractText() concatena fragmentos e pode perder os espaços entre as colunas.
      // extractTextItems() preserva X/Y e permite reconstruir as linhas visuais.
      etapa = "extração do texto e das tabelas";
      const { items: paginas } = await extractTextItems(pdf);
      const texto = reconstruirLinhasPdf(paginas).join("\n");
      if (!paginas.length || paginas.every((pagina) => pagina.length === 0)) {
        return { itens: [], erro: "O PDF abriu, mas não contém texto selecionável. Gere o relatório novamente em PDF pesquisável, não como imagem digitalizada." };
      }
      etapa = "leitura da data na última página";
      const dataRelatorio = extrairDataRelatorioUltimaPagina(paginas);
      if (data.exigirDataAtual) {
        if (!dataRelatorio) {
          return { itens: [], erro: "PDF recusado: não foi possível identificar a data de emissão na última página. Anexe o relatório completo, com a data visível no rodapé da última página." };
        }
        const hoje = dataAtualSaoPaulo();
        if (dataRelatorio !== hoje) {
          const dataEncontrada = dataRelatorio.split("-").reverse().join("/");
          const dataExigida = hoje.split("-").reverse().join("/");
          return { itens: [], dataRelatorio, erro: `PDF recusado: o relatório foi emitido em ${dataEncontrada}. Para criar um pedido, anexe a relação de saldo emitida na data de hoje (${dataExigida}).` };
        }
      }
      if (!texto || texto.trim().length < 30) {
        return { itens: [], erro: "Não encontrei texto legível neste PDF. Se for um documento escaneado, envie uma planilha Excel ou CSV." };
      }

      etapa = "identificação dos itens e saldos";
      const itens = extrairItensAtaTexto(texto);
      if (itens.length === 0) {
        return {
          itens: [],
          erro: "Não reconheci o formato do relatório. Envie a 'Relação de Saldo Disponível para Ata de Registro de Preço' do JL Soft ou uma planilha com as colunas correspondentes.",
        };
      }
      return { itens, ...(dataRelatorio ? { dataRelatorio } : {}) };
    } catch (e) {
      const detalhe = e instanceof Error
        ? `${e.name}: ${e.message}`
        : String(e);
      console.error("extrairItensPdf - etapa:", etapa, "- erro:", detalhe, e);
      return {
        itens: [],
        erro: `Falha na etapa "${etapa}": ${detalhe.slice(0, 240)}. Confira o PDF e tente novamente.`,
      };
    }
  });
