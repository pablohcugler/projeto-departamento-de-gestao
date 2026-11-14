/** "Bom dia" (05h–11h59), "Boa tarde" (12h–17h59) ou "Boa noite" (18h–04h59), no horário local do navegador. */
export function saudacaoPorHora(agora: Date = new Date()): string {
  const h = agora.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Primeiro nome com a inicial maiúscula: "  pablo henrique " → "Pablo". Retorna "" se vazio. */
export function primeiroNome(nomeCompleto?: string | null): string {
  const p = (nomeCompleto ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR") : "";
}
