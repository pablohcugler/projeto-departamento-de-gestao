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
const TEMPO_LIMITE_POR_PAGINA_MS = 7_000;

type PaginaBll = {
  indice: number;
  html?: string;
  erro?: string;
};

async function carregarPaginaBll(pagina: number): Promise<PaginaBll> {
  const url = new URL(BLL_PUBLIC_URL);
  url.searchParams.set("param1", String(pagina));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEMPO_LIMITE_POR_PAGINA_MS);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://bllcompras.com/",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return { indice: pagina, erro: "A BLL respondeu HTTP " + response.status + " na página " + pagina + "." };
    }

    const html = await response.text();
    if (html.length < 1000) {
      return { indice: pagina, erro: "A BLL retornou uma página vazia ou incompleta na página " + pagina + "." };
    }
    if (/access denied|captcha|temporarily blocked|acesso negado|just a moment/i.test(html)) {
      return { indice: pagina, erro: "A BLL bloqueou a leitura automática da página " + pagina + " (proteção antirobô/CAPTCHA)." };
    }
    if (!/<tr\b[^>]*>/i.test(html)) {
      return { indice: pagina, erro: "A BLL respondeu à página " + pagina + ", mas a tabela de processos não veio no HTML." };
    }

    return { indice: pagina, html };
  } catch (error) {
    if (controller.signal.aborted) {
      return { indice: pagina, erro: "Tempo esgotado após 7 segundos na página " + pagina + " da BLL." };
    }
    const mensagem = error instanceof Error ? error.message : String(error);
    return { indice: pagina, erro: "Falha de rede na página " + pagina + " da BLL: " + mensagem };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Percorre as páginas públicas da BLL de forma sequencial, imitando a
 * navegação normal de um navegador. Interrompe assim que todos os editais
 * solicitados forem encontrados, reduzindo chamadas simultâneas e risco
 * de bloqueio temporário pelo portal.
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
    errosPagina: string[];
    resultados: ResultadoStatusBll[];
    aviso?: string;
  }> => {
    const consultadoEm = new Date().toISOString();
    const resultadosPorAta = new Map<string, ResultadoStatusBll>();
    const errosPagina: string[] = [];
    let paginasDisponiveis = 0;

    for (let pagina = 0; pagina < PAGINAS_CONSULTADAS; pagina += 1) {
      const resposta = await carregarPaginaBll(pagina);

      if (!resposta.html) {
        errosPagina.push(resposta.erro ?? "Falha desconhecida na página " + pagina + ".");
        continue;
      }

      paginasDisponiveis += 1;
      const resultadosPagina = extrairStatusBllHtml(resposta.html, data.processos);

      for (const resultado of resultadosPagina) {
        if (resultado.localizado && resultado.fase) {
          resultadosPorAta.set(resultado.ataId, resultado);
        }
      }

      if (resultadosPorAta.size === data.processos.length) {
        break;
      }
    }

    if (paginasDisponiveis === 0) {
      throw new Error(
        "Não foi possível ler nenhuma página pública da BLL. " +
        (errosPagina.slice(0, 3).join(" ") || "A BLL não retornou conteúdo legível."),
      );
    }

    const resultados = data.processos.map((processo) =>
      resultadosPorAta.get(processo.ataId) ?? {
        ataId: processo.ataId,
        numeroEdital: processo.numeroEdital,
        fase: null,
        localizado: false,
        mensagem: errosPagina.length
          ? "Edital não localizado. Falhas: " + errosPagina.join(" ")
          : "Edital não localizado nas páginas públicas consultadas da BLL.",
      },
    );

    const localizados = resultados.filter((r) => r.localizado).length;
    return {
      consultadoEm,
      fonte: BLL_PUBLIC_URL + "?param1=0",
      paginasConsultadas: paginasDisponiveis + errosPagina.length,
      paginasDisponiveis,
      paginasComFalha: errosPagina.length,
      errosPagina,
      resultados,
      ...(errosPagina.length > 0
        ? { aviso: "A consulta foi parcial: " + paginasDisponiveis + " página(s) foram lidas e " + errosPagina.length + " falharam." }
        : localizados === 0
          ? { aviso: "Nenhum edital foi encontrado nas seis páginas públicas consultadas. Confira o número e abra a BLL para verificar." }
          : {}),
    };
  });
