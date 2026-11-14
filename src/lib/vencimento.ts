export type StatusAta = "vencida" | "alerta" | "vigente";

/** Dias entre hoje e a data de vencimento (negativo = já venceu). */
export function diasParaVencer(dataVencimento: string, hoje: Date = new Date()): number {
  const [y, m, d] = dataVencimento.split("-").map(Number);
  const venc = Date.UTC(y, m - 1, d);
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((venc - h) / 86400000);
}

export function statusAta(dataVencimento: string, diasAlerta: number, hoje: Date = new Date()): StatusAta {
  const dias = diasParaVencer(dataVencimento, hoje);
  if (dias < 0) return "vencida";
  if (dias <= diasAlerta) return "alerta";
  return "vigente";
}

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBR = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
