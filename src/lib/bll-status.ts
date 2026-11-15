export type ProcessoBllConsulta = {
  ataId: string;
  numeroEdital: string;
};

export type ResultadoStatusBll = {
  ataId: string;
  numeroEdital: string;
  fase: string | null;
  localizado: boolean;
  mensagem?: string;
};

export function normalizarBll(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/g, "");
}

function decodificarHtml(valor: string): string {
  return valor
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:div|p|span|li|a)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai a coluna "Situação" da listagem pública da BLL.
 * A página apresenta Promotor, Número, Modalidade, Cidade e Situação.
 * A coluna de ações pode existir antes do Promotor; por isso a posição
 * é descoberta pelo texto do promotor e não por um índice fixo.
 */
export function extrairStatusBllHtml(
  html: string,
  processos: ProcessoBllConsulta[],
): ResultadoStatusBll[] {
  const pedidos = new Map<string, ProcessoBllConsulta[]>();
  for (const processo of processos) {
    const chave = normalizarBll(processo.numeroEdital);
    if (!chave) continue;
    const grupo = pedidos.get(chave) ?? [];
    grupo.push(processo);
    pedidos.set(chave, grupo);
  }

  const encontrados = new Map<string, string>();
  const linhas = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  for (const linha of linhas) {
    const celulas = [...linha.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
      .map((m) => decodificarHtml(m[1] ?? ""));
    const idxPromotor = celulas.findIndex(
      (celula) => normalizarBll(celula).includes("municipiodecajati"),
    );
    if (idxPromotor < 0) continue;

    const numero = celulas[idxPromotor + 1] ?? "";
    const fase = celulas[idxPromotor + 4] ?? "";
    const chaveNumero = normalizarBll(numero);
    if (!chaveNumero || !fase) continue;

    const correspondencias = [...pedidos.entries()].filter(([chave]) =>
      chaveNumero === chave || normalizarBll(numero).includes(chave),
    );
    for (const [chave] of correspondencias) {
      if (!encontrados.has(chave)) encontrados.set(chave, fase);
    }
  }

  return processos.map((processo) => {
    const fase = encontrados.get(normalizarBll(processo.numeroEdital)) ?? null;
    return {
      ataId: processo.ataId,
      numeroEdital: processo.numeroEdital,
      fase,
      localizado: Boolean(fase),
      ...(!fase
        ? { mensagem: "Edital não localizado na listagem pública consultada da BLL." }
        : {}),
    };
  });
}
