import { createServerFn } from "@tanstack/react-start";
import { forwardSupabaseAccessToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuthForWorker } from "@/integrations/supabase/auth-middleware-worker";
import {
  extrairStatusBllHtml,
  type ProcessoBllConsulta,
  type ResultadoStatusBll,
} from "@/lib/bll-status";

const BLL_PUBLIC_URL = "https://bllcompras.com/Process/ProcessSearchPublic";
const PAGINAS_CONSULTADAS = 6;
const TEMPO_LIMITE_POR_PAGINA_MS = 8_000;

async function carregarPaginaBll(pagina: number): Promise<string> {
  const url = new URL(BLL_PUBLIC_URL);
  url.searchParams.set("param1", String(pagina));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEMPO_LIMITE_POR_PAGINA_MS);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        Referer: "https://bllcompras.com/",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const html = await response.text();
    if (html.length < 1000 || /access denied|captcha|temporarily blocked|acesso negado/i.test(html)) {
      throw new Error("A BLL não disponibilizou a listagem pública.");
    }
    if (!/<tr\b[^>]*>/i.test(html)) {
      throw new Error("A página foi recebida, mas a tabela de processos não veio no HTML.");
    }

    return html;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Tempo esgotado ao consultar a página " + pagina + " da BLL (8 segundos).");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Consulta em lote até seis páginas públicas da BLL.
 * Cada requisição tem limite de oito segundos. Falha em uma página não
 * impede o uso dos resultados das demais; se todas falharem, a função
 * termina com erro legível em vez de deixar a interface carregando.
 */
export const consultarStatusBll = createServerFn({ method: "POST" })
  .middleware([forwardSupabaseAccessToken, requireSupabaseAuthForWorker])
  .inputValidator((input: { processos: ProcessoBllConsulta[] }) => {
    if (!Array.isArray(input?.processos) || input.processos.length > 100) {
      throw new Error("A consulta BLL aceita até 100 editais por vez.");
    }
    const processos = input.processos.map((p) => ({
      ataId: String(p.ataId ?? "").trim(),
      numeroEdital: String(p.numeroEdital ?? "").trim(),
    }));
    if (processos.some((p) => !p.ataId || !p.numeroEdital || p.numeroEdital.length > 80)) {
      throw new Error("Informe um número de edital válido para cada Ata.");
    }
    return { processos };
  })
  .handler(async ({ data }): Promise<{
    consultadoEm: string;
    fonte: string;
    paginasConsultadas: number;
    paginasDisponiveis: number;
    paginasComFalha: number;
    resultados: ResultadoStatusBll[];
    aviso?: string;
  }> => {
    const consultadoEm = new Date().toISOString();

    const respostas = await Promise.allSettled(
      Array.from({ length: PAGINAS_CONSULTADAS }, (_, pagina) => carregarPaginaBll(pagina)),
    );

    const paginas = respostas
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);
    const falhas = respostas.filter((r) => r.status === "rejected");
    const paginasComFalha = falhas.length;

    if (paginas.length === 0) {
      const motivos = falhas
        .slice(0, 2)
        .map((r) => r.status === "rejected" && r.reason instanceof Error ? r.reason.message : "falha desconhecida")
        .join("; ");
      throw new Error(
        "A BLL não respondeu a nenhuma das seis páginas consultadas. " +
        (motivos ? "Detalhe: " + motivos : "Tente novamente mais tarde."),
      );
    }

    const resultadosPorAta = new Map<string, ResultadoStatusBll>();
    for (const html of paginas) {
      const resultados = extrairStatusBllHtml(html, data.processos);
      for (const resultado of resultados) {
        if (resultado.localizado && resultado.fase) {
          resultadosPorAta.set(resultado.ataId, resultado);
        }
      }
    }

    const resultados = data.processos.map((processo) =>
      resultadosPorAta.get(processo.ataId) ?? {
        ataId: processo.ataId,
        numeroEdital: processo.numeroEdital,
        fase: null,
        localizado: false,
        mensagem: paginasComFalha > 0
          ? "Edital não localizado nas páginas disponíveis. " + paginasComFalha + " página(s) da BLL não responderam."
          : "Edital não localizado nas seis páginas públicas consultadas da BLL.",
      },
    );

    const localizados = resultados.filter((r) => r.localizado).length;
    return {
      consultadoEm,
      fonte: BLL_PUBLIC_URL + "?param1=0",
      paginasConsultadas: PAGINAS_CONSULTADAS,
      paginasDisponiveis: paginas.length,
      paginasComFalha,
      resultados,
      ...(paginasComFalha > 0
        ? { aviso: "A BLL respondeu a " + paginas.length + " de " + PAGINAS_CONSULTADAS + " páginas. O status pode estar incompleto." }
        : localizados === 0
          ? { aviso: "Nenhum edital foi encontrado nas seis páginas públicas consultadas. Confira o número do edital na busca pública da BLL." }
          : {}),
    };
  });
