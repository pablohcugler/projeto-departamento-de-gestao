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

/** Campos posicionais retornados pelo unpdf.extractTextItems. */
export type TextoPdfPosicionado = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
};

/**
 * Reconstrói as linhas visuais do PDF a partir das coordenadas dos fragmentos.
 * O JL Soft posiciona cada coluna separadamente; juntar apenas item.str elimina
 * os espaços entre código, descrição, unidade e valores. O agrupamento por Y
 * e a ordenação por X recuperam a estrutura tabular sem OCR ou IA.
 */
export function reconstruirLinhasPdf(paginas: TextoPdfPosicionado[][]): string[] {
  const resultado: string[] = [];

  for (const pagina of paginas) {
    const itens = pagina
      .filter((item) => typeof item.str === "string" && item.str.trim() && Number.isFinite(item.x) && Number.isFinite(item.y))
      .slice()
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const linhas: Array<{ y: number; itens: TextoPdfPosicionado[] }> = [];

    for (const item of itens) {
      const tamanhoFonte = item.fontSize > 0 ? item.fontSize : item.height > 0 ? item.height : 8;
      const tolerancia = Math.max(1.1, Math.min(tamanhoFonte * 0.22, 2.2));
      let linhaMaisProxima: (typeof linhas)[number] | undefined;
      let menorDistancia = Number.POSITIVE_INFINITY;

      for (const linha of linhas) {
        const distancia = Math.abs(linha.y - item.y);
        if (distancia <= tolerancia && distancia < menorDistancia) {
          linhaMaisProxima = linha;
          menorDistancia = distancia;
        }
      }

      if (!linhaMaisProxima) {
        linhas.push({ y: item.y, itens: [item] });
      } else {
        linhaMaisProxima.itens.push(item);
        linhaMaisProxima.y =
          linhaMaisProxima.itens.reduce((soma, atual) => soma + atual.y, 0) /
          linhaMaisProxima.itens.length;
      }
    }

    linhas.sort((a, b) => b.y - a.y);

    for (const linha of linhas) {
      const ordenados = linha.itens.slice().sort((a, b) => a.x - b.x);
      let texto = "";
      let anterior: TextoPdfPosicionado | undefined;

      for (const item of ordenados) {
        const trecho = item.str.replace(/[\r\n]+/g, " ");
        if (!trecho) continue;

        if (anterior && texto) {
          const espacoHorizontal = item.x - (anterior.x + anterior.width);
          const fonte = Math.min(
            anterior.fontSize > 0 ? anterior.fontSize : 8,
            item.fontSize > 0 ? item.fontSize : 8,
          );
          const limiteEspaco = Math.max(0.6, fonte * 0.1);
          if (
            espacoHorizontal > limiteEspaco &&
            !/\s$/.test(texto) &&
            !/^\s/.test(trecho)
          ) {
            texto += " ";
          }
        }

        texto += trecho;
        anterior = item;
      }

      const limpa = texto.replace(/[\t ]+/g, " ").trim();
      if (limpa) resultado.push(limpa);
    }

    // Mantém uma quebra entre páginas sem perder o fornecedor corrente.
    resultado.push("");
  }

  return resultado;
}

export function numeroBR(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const ignorarLinha = (linha: string) =>
  /^(?:valor total|cd\. item|cd\. produto|prefeitura municipal|departamento de administração|divisão de compras|jl soft|relação de saldo|relacao de saldo|modalidade:|processo\/ano:|data da licitação:|data início:|data fim:|sequência:|ata:|exercício:|exercicio:|página:|pagina:|id:|cajati,|jailton pereira|diretor do departamento|rg:)/i.test(linha.trim());

/**
 * Lê o relatório "Relação de Saldo Disponível para Ata de Registro de Preço"
 * exportado pelo sistema JL Soft. Os códigos são preservados como texto.
 */
export function extrairItensAtaTexto(texto: string): ItemImportado[] {
  const linhas = texto.replace(/\r/g, "").replace(/\f/g, "\n").split("\n");
  const itens: ItemImportado[] = [];
  let fornecedor = "";

  const fornecedorRe = /Fornecedor:\s*\d+\s*-\s*(.+)$/i;
  const itemRe = /^\s*(\d{4})\s+(\d{2}\.\d{5})\s+(.*?)\s+([\p{L}]{1,5})\s+([\d.]+,\d{2,4})\s+([\d.]+,\d{2,4})\s+([\d.]+,\d{2})\s*$/u;

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
