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

/**
 * Consulta páginas públicas da BLL em lote. O parâmetro param1 é o índice
 * da página pública: 0 é a primeira, 1 a seguinte etc. Procuramos até seis
 * páginas para não considerar "não localizado" apenas por o edital estar
 * fora da primeira página mais recente.
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
    resultados: ResultadoStatusBll[];
    aviso?: string;
  }> => {
    const consultadoEm = new Date().toISOString();

    try {
      const paginas = await Promise.all(
        Array.from({ length: PAGINAS_CONSULTADAS }, async (_, pagina) => {
          const url = new URL(BLL_PUBLIC_URL);
          url.searchParams.set("param1", String(pagina));
          const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
              Accept: "text/html,application/xhtml+xml",
              "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
              Referer: "https://bllcompras.com/",
            },
            redirect: "follow",
          });

          if (!response.ok) {
            throw new Error("A BLL respondeu HTTP " + response.status + " ao consultar a página " + pagina + ".");
          }

          const html = await response.text();
          if (html.length < 1000 || /access denied|captcha|temporarily blocked|acesso negado/i.test(html)) {
            throw new Error("A BLL não disponibilizou a listagem pública da página " + pagina + ".");
          }
          if (!/<tr\b[^>]*>/i.test(html)) {
            throw new Error("A BLL carregou a página " + pagina + ", mas não disponibilizou a tabela de processos.");
          }

          return html;
        }),
      );

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
          mensagem: "Edital não localizado nas seis páginas públicas consultadas da BLL.",
        },
      );

      const localizados = resultados.filter((r) => r.localizado).length;
      return {
        consultadoEm,
        fonte: BLL_PUBLIC_URL + "?param1=0",
        paginasConsultadas: PAGINAS_CONSULTADAS,
        resultados,
        ...(localizados === 0
          ? {
              aviso: "Nenhum edital foi encontrado nas seis páginas públicas consultadas. A BLL pode ter mais páginas ou alterado a forma de exibição; abra a busca pública para conferir manualmente.",
            }
          : {}),
      };
    } catch (e) {
      console.error("consultarStatusBll", e);
      const mensagem =
        e instanceof Error ? e.message : "Falha inesperada ao consultar a BLL.";
      throw new Error("Não foi possível consultar a BLL agora: " + mensagem);
    }
  });
