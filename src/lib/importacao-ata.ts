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


const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function dataIso(ano: number, mes: number, dia: number): string | null {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Extrai a data de emissão do rodapé da última página do relatório. */
export function extrairDataRelatorioTexto(texto: string): string | null {
  const datas: Array<{ indice: number; valor: string }> = [];
  const extenso = /\b(\d{1,2})\s+de\s+([\p{L}çãõáéíóúâêô]+)\s+de\s+(\d{4})\b/giu;
  for (const m of texto.matchAll(extenso)) {
    const dia = Number(m[1]);
    const mesNome = (m[2] ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    const mes = MESES_PT[mesNome];
    const ano = Number(m[3]);
    const valor = mes ? dataIso(ano, mes, dia) : null;
    if (valor) datas.push({ indice: m.index ?? 0, valor });
  }

  const numerica = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/g;
  for (const m of texto.matchAll(numerica)) {
    const valor = dataIso(Number(m[3]), Number(m[2]), Number(m[1]));
    if (valor) datas.push({ indice: m.index ?? 0, valor });
  }

  return datas.sort((a, b) => a.indice - b.indice).at(-1)?.valor ?? null;
}

/** Data corrente no fuso oficial do Município (America/Sao_Paulo). */
export function dataAtualSaoPaulo(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

/** Lê a data exclusivamente da última página, como solicitado para o pedido. */
export function extrairDataRelatorioUltimaPagina(paginas: TextoPdfPosicionado[][]): string | null {
  const ultimaPagina = paginas[paginas.length - 1] ?? [];
  return extrairDataRelatorioTexto(reconstruirLinhasPdf([ultimaPagina]).join("\n"));
}
