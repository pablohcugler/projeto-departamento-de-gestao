import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuthForWorker } from "@/integrations/supabase/auth-middleware-worker";
import { forwardSupabaseAccessToken } from "@/integrations/supabase/auth-client-middleware";
import { extrairItensAtaTexto, type ItemImportado } from "@/lib/importacao-ata";

export type { ItemImportado } from "@/lib/importacao-ata";

export const extrairItensPdf = createServerFn({ method: "POST" })
  .middleware([forwardSupabaseAccessToken, requireSupabaseAuthForWorker])
  .inputValidator((input: { base64: string }) => {
    if (typeof input?.base64 !== "string" || input.base64.length > 15_000_000) {
      throw new Error("Arquivo inválido ou muito grande (máx. ~10 MB).");
    }
    return input;
  })
  .handler(async ({ data }): Promise<{ itens: ItemImportado[]; erro?: string }> => {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      if (!text || text.trim().length < 30) {
        return { itens: [], erro: "Não encontrei texto neste PDF. O arquivo pode estar escaneado; tente uma planilha Excel ou CSV." };
      }

      const itens = extrairItensAtaTexto(text);
      if (itens.length === 0) {
        return {
          itens: [],
          erro: "Não reconheci o formato do relatório. Envie a 'Relação de Saldo Disponível para Ata de Registro de Preço' do JL Soft ou uma planilha com as colunas correspondentes.",
        };
      }
      return { itens };
    } catch (e) {
      console.error("extrairItensPdf", e);
      return { itens: [], erro: "Não foi possível ler o PDF. Tente novamente ou utilize uma planilha Excel/CSV." };
    }
  });
