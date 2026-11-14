import type { ItemImportado } from "./importar.functions";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function numeroBR(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Converte linhas de planilha (com cabeçalho) em itens, reconhecendo nomes de colunas comuns. */
export function linhasParaItens(linhas: Record<string, unknown>[]): ItemImportado[] {
  return linhas
    .map((l) => {
      const get = (...chaves: string[]) => {
        const k = Object.keys(l).find((c) => chaves.some((x) => norm(c).includes(x)));
        return k ? l[k] : "";
      };
      return {
        descricao: String(get("descri", "item", "produto", "especifica") ?? "").trim(),
        fornecedor: String(get("fornecedor", "empresa", "vencedor") ?? "").trim(),
        unidade: String(get("unid", "un.", "medida") || "UN").trim(),
        quantidade: numeroBR(get("quant", "qtd", "qtde")) || 1,
        preco_unitario: numeroBR(get("unitario", "preco unit", "valor unit", "unit")),
      };
    })
    .filter((i) => i.descricao);
}
