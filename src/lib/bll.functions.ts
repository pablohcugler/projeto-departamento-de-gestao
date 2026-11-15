import { createServerFn } from "@tanstack/react-start";
import { forwardSupabaseAccessToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuthForWorker } from "@/integrations/supabase/auth-middleware-worker";
import {
  extrairStatusBllHtml,
  type ProcessoBllConsulta,
  type ResultadoStatusBll,
} from "@/lib/bll-status";

const BLL_PUBLIC_URL = "https://bllcompras.com/Process/ProcessSearchPublic?param1=0";

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
    resultados: ResultadoStatusBll[];
    aviso?: string;
  }> => {
    const consultadoEm = new Date().toISOString();

    try {
      const response = await fetch(BLL_PUBLIC_URL, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          Referer: "https://bllcompras.com/",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error("A BLL respondeu HTTP " + response.status + ".");
      }

      const html = await response.text();
      if (html.length < 1000 || /access denied|captcha|temporarily blocked/i.test(html)) {
        throw new Error("A consulta pública da BLL não disponibilizou a listagem de processos.");
      }

      const resultados = extrairStatusBllHtml(html, data.processos);
      const localizados = resultados.filter((r) => r.localizado).length;
      return {
        consultadoEm,
        fonte: BLL_PUBLIC_URL,
        resultados,
        ...(localizados === 0
          ? { aviso: "Nenhum dos editais foi encontrado na listagem pública carregada pela BLL. O portal pode estar exibindo outra página de resultados ou alterado o formato da listagem." }
          : {}),
      };
    } catch (e) {
      console.error("consultarStatusBll", e);
      const mensagem =
        e instanceof Error ? e.message : "Falha inesperada ao consultar a BLL.";
      throw new Error("Não foi possível consultar a BLL agora: " + mensagem);
    }
  });
