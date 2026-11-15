import { createServerFn } from "@tanstack/react-start";
import { forwardSupabaseAccessToken } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuthForWorker } from "@/integrations/supabase/auth-middleware-worker";
import type { ProcessoBllConsulta } from "@/lib/bll-status";

/**
 * A listagem pública da BLL está protegida por CAPTCHA/anti-bot e não deve
 * ser automatizada por tentativas de imitar navegador, contornar bloqueios
 * ou repetir requisições. O status precisa ser consultado manualmente até
 * a BLL habilitar uma integração oficial para o Município (Web Service/API).
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
  .handler(async ({ data }) => {
    return {
      consultadoEm: new Date().toISOString(),
      fonte: "https://bllcompras.com/Process/ProcessSearchPublic?param1=0",
      paginasConsultadas: 0,
      paginasDisponiveis: 0,
      paginasComFalha: 0,
      errosPagina: ["Consulta automática desativada: a BLL exige validação antibot/CAPTCHA. Use a consulta manual ou solicite à BLL acesso ao Web Service oficial."],
      resultados: data.processos.map((processo) => ({
        ataId: processo.ataId,
        numeroEdital: processo.numeroEdital,
        fase: null,
        localizado: false,
        mensagem: "Status não confirmado. A consulta pública automatizada está indisponível.",
      })),
      aviso: "Nenhum status foi confirmado automaticamente. Consulte a BLL manualmente.",
    };
  });
