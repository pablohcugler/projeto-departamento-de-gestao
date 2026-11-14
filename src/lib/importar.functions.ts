import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ItemImportado = {
  descricao: string;
  fornecedor: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
};

export const extrairItensPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { base64: string }) => {
    if (typeof input?.base64 !== "string" || input.base64.length > 15_000_000) throw new Error("Arquivo inválido ou muito grande (máx. ~10 MB).");
    return input;
  })
  .handler(async ({ data }): Promise<{ itens: ItemImportado[]; erro?: string }> => {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    if (!text || text.trim().length < 30) {
      return { itens: [], erro: "Não encontrei texto neste PDF (pode ser um documento escaneado). Tente a importação por planilha." };
    }
    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    try {
      const res = await generateResponse({
        model: "openai/gpt-6.1-terra",
        instructions:
          "Você extrai itens de Atas de Registro de Preço de municípios brasileiros. Liste TODOS os itens registrados com descrição, fornecedor (empresa vencedora do item, se houver), unidade, quantidade e preço unitário em reais (número com ponto decimal). Não invente itens. Se um campo não existir, use string vazia ou 0.",
        input: [{ role: "user", content: `Texto da ata:\n\n${text.slice(0, 200_000)}` }],
        text: {
          format: {
            type: "json_schema",
            name: "itens_ata",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["itens"],
              properties: {
                itens: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["descricao", "fornecedor", "unidade", "quantidade", "preco_unitario"],
                    properties: {
                      descricao: { type: "string" },
                      fornecedor: { type: "string" },
                      unidade: { type: "string" },
                      quantidade: { type: "number" },
                      preco_unitario: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const out = (res as { output_text?: string }).output_text ??
        JSON.stringify(res.output?.flatMap((o) => ("content" in o && Array.isArray(o.content) ? o.content : [])).find((c) => c && typeof c === "object" && "text" in c)?.["text" as never] ?? "");
      const textoJson = typeof out === "string" && out.startsWith('"') ? JSON.parse(out) : out;
      const parsed = JSON.parse(textoJson) as { itens: ItemImportado[] };
      return { itens: parsed.itens };
    } catch (e) {
      console.error("extrairItensPdf", e);
      if (e instanceof GatewayError && e.code === "payment_required") return { itens: [], erro: "Créditos de IA esgotados." };
      return { itens: [], erro: "Não foi possível ler os itens deste PDF. Tente novamente ou use uma planilha." };
    }
  });
