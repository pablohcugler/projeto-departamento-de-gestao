import type { ItemImportado } from "./importacao-ata";
import { numeroBR } from "./importacao-ata";
export { numeroBR };

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Converte linhas de planilha (com cabeçalho) em itens, reconhecendo nomes comuns de colunas. */
export function linhasParaItens(linhas: Record<string, unknown>[]): ItemImportado[] {
  return linhas
    .map((l) => {
      const get = (...chaves: string[]) => {
        const k = Object.keys(l).find((c) => chaves.some((x) => norm(c).includes(norm(x))));
        return k ? l[k] : "";
      };
      const quantidadeTxt = get("quantidade", "qtd saldo", "quant", "qtde");
      const precoTxt = get("valor unitario", "vl unitario", "preco unitario", "unitario");
      const quantidade = quantidadeTxt === "" ? 0 : numeroBR(quantidadeTxt);
      const precoUnitario = precoTxt === "" ? 0 : numeroBR(precoTxt);
      const totalTxt = get("valor total", "vl total saldo", "total saldo", "total");
      return {
        codigo_item: String(get("cd item", "codigo item", "cod item") ?? "").trim(),
        codigo_produto: String(get("cd produto", "codigo produto", "cod produto") ?? "").trim(),
        descricao: String((get("descricao", "descri", "especificacao", "nome do item") || get("produto")) ?? "").trim(),
        fornecedor: String(get("fornecedor", "empresa", "vencedor") ?? "").trim(),
        unidade: String(get("unidade", "unid", "medida") || "UN").trim(),
        quantidade,
        preco_unitario: precoUnitario,
        valor_total: totalTxt === "" ? quantidade * precoUnitario : numeroBR(totalTxt),
      };
    })
    .filter((i) => i.descricao);
}
