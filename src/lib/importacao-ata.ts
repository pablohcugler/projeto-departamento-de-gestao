export type ItemImportado = {
  codigo_item: string;
  codigo_produto: string;
  descricao: string;
  fornecedor: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  valor_total: number;
};

export function numeroBR(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const ignorarLinha = (linha: string) =>
  /^(?:valor total|cd\. item|cd\. produto|prefeitura municipal|departamento de administração|divisão de compras|jl soft|relação de saldo|relacao de saldo|modalidade:|processo\/ano:|data da licitação:|data início:|data fim:|exercício:|página:|cajati,|jailton pereira|diretor do departamento|rg:)/i.test(linha.trim());

/**
 * Lê o relatório "Relação de Saldo Disponível para Ata de Registro de Preço"
 * exportado pelo sistema JL Soft. Os códigos são preservados como texto.
 */
export function extrairItensAtaTexto(texto: string): ItemImportado[] {
  const linhas = texto.replace(/\r/g, "").replace(/\f/g, "\n").split("\n");
  const itens: ItemImportado[] = [];
  let fornecedor = "";

  const fornecedorRe = /Fornecedor:\s*\d+\s*-\s*(.+)$/i;
  const itemRe = /^\s*(\d{4})\s+(\d{2}\.\d{5})\s+(.*?)\s+([A-ZÀ-ÿ]{1,5})\s+([\d.]+,\d{2,4})\s+([\d.]+,\d{2,4})\s+([\d.]+,\d{2})\s*$/u;

  for (const linha of linhas) {
    const nomeFornecedor = linha.match(fornecedorRe);
    if (nomeFornecedor) {
      fornecedor = nomeFornecedor[1].trim();
      continue;
    }

    const m = linha.match(itemRe);
    if (m) {
      itens.push({
        codigo_item: m[1],
        codigo_produto: m[2],
        descricao: m[3].trim(),
        fornecedor,
        unidade: m[4],
        preco_unitario: numeroBR(m[5]),
        quantidade: numeroBR(m[6]),
        valor_total: numeroBR(m[7]),
      });
      continue;
    }

    const complemento = linha.trim();
    if (!complemento || ignorarLinha(complemento) || /^\d+\s+[-–]/.test(complemento)) continue;
    const ultimo = itens[itens.length - 1];
    if (ultimo && fornecedor) ultimo.descricao = (ultimo.descricao + " " + complemento).trim();
  }

  return itens.filter((item) => item.descricao && item.fornecedor && Number.isFinite(item.quantidade) && Number.isFinite(item.preco_unitario));
}
