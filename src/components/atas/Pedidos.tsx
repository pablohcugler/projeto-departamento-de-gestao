import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { brl, dataBR } from "@/lib/vencimento";

type Pedido = Tables<"pedidos">;
type Ata = Tables<"atas">;
type ItemPedido = {
  codigo_item: string;
  descricao: string;
  fornecedor: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  valor_total: number;
};

function escapar(valor: string) {
  const mapa: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return valor.replace(/[&<>"']/g, (c) => mapa[c] ?? c);
}

function itensDoPedido(valor: Json): ItemPedido[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item) => !!item && typeof item === "object" && !Array.isArray(item)).map((item) => {
    const dado = item as Record<string, unknown>;
    return {
      codigo_item: String(dado["codigo_item"] ?? ""),
      descricao: String(dado["descricao"] ?? ""),
      fornecedor: String(dado["fornecedor"] ?? ""),
      unidade: String(dado["unidade"] ?? ""),
      quantidade: Number(dado["quantidade"] ?? 0),
      preco_unitario: Number(dado["preco_unitario"] ?? 0),
      valor_total: Number(dado["valor_total"] ?? 0),
    };
  });
}

export function Pedidos({ atas }: { atas: Ata[] }) {
  const [busca, setBusca] = useState("");
  const [pedidoAberto, setPedidoAberto] = useState<Pedido | null>(null);
  const pedidosQ = useQuery({
    queryKey: ["pedidos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pedidos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const setoresQ = useQuery({
    queryKey: ["setores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("id,nome").order("nome");
      if (error) throw error;
      return data;
    },
  });
  const pedidos = pedidosQ.data ?? [];
  const atasPorId = useMemo(() => new Map(atas.map((ata) => [ata.id, ata])), [atas]);
  const setoresPorId = useMemo(() => new Map((setoresQ.data ?? []).map((setor) => [setor.id, setor.nome])), [setoresQ.data]);
  const filtrados = useMemo(() => {
    const termo = busca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!termo) return pedidos;
    return pedidos.filter((pedido) => {
      const ata = atasPorId.get(pedido.ata_id);
      const itens = itensDoPedido(pedido.itens);
      return [
        ata?.numero ?? "",
        ata?.objeto ?? "",
        pedido.justificativa,
        setoresPorId.get(pedido.setor_id) ?? "",
        ...itens.map((item) => item.descricao),
      ].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(termo);
    });
  }, [pedidos, busca, atasPorId, setoresPorId]);

  function gerarPdf(pedido: Pedido) {
    const ata = atasPorId.get(pedido.ata_id);
    const itens = itensDoPedido(pedido.itens);
    const janela = window.open("", "_blank");
    if (!janela) {
      toast.error("Permita pop-ups para gerar novamente o PDF do pedido.");
      return;
    }
    const grupos = new Map<string, ItemPedido[]>();
    for (const item of itens) {
      const fornecedor = item.fornecedor.trim() || "FORNECEDOR NÃO INFORMADO";
      const grupo = grupos.get(fornecedor) ?? [];
      grupo.push(item);
      grupos.set(fornecedor, grupo);
    }
    const tabelas = [...grupos.entries()].map(([fornecedor, linhas]) => {
      const linhasHtml = linhas.map((item) =>
        "<tr><td>" + escapar(item.codigo_item) + "</td><td>" + escapar(item.descricao) + "</td><td class='num'>" +
        item.quantidade.toLocaleString("pt-BR") + "</td><td class='num'>" + brl(item.preco_unitario) +
        "</td><td class='num'>" + brl(item.valor_total) + "</td></tr>",
      ).join("");
      return "<h3>FORNECEDOR: " + escapar(fornecedor) + "</h3><table><thead><tr><th>COD. DO ITEM</th><th>DESCRIÇÃO RESUMIDA</th><th>QUANTIDADE</th><th>VALOR UNITÁRIO</th><th>VALOR TOTAL</th></tr></thead><tbody>" + linhasHtml + "</tbody></table>";
    }).join("");
    const data = new Date(pedido.created_at).toLocaleDateString("pt-BR");
    const ataHtml = ata ? "<p><strong>Ata:</strong> " + escapar(ata.numero ?? "") + " — " + escapar(ata.objeto) + "</p>" : "";
    const html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>Pedido_" + pedido.id.slice(0, 8) + "</title><style>" +
      "@page{size:A4;margin:18mm 15mm}body{font-family:Arial,sans-serif;color:#111;font-size:11pt}" +
      ".just{white-space:pre-wrap;line-height:1.45;margin:0 0 22px}h3{font-size:10pt;margin:18px 0 7px}" +
      "table{width:100%;border-collapse:collapse;margin-bottom:12px;table-layout:fixed}" +
      "th,td{border:1px solid #555;padding:6px 5px;font-size:9pt;vertical-align:top;overflow-wrap:anywhere}" +
      "th{background:#eee;text-align:left}.num{text-align:right;white-space:nowrap}.total{text-align:right;font-weight:bold;margin-top:14px}" +
      "</style></head><body><p>Prezados,</p><p class='just'>" + escapar(pedido.justificativa) + "</p>" +
      ataHtml + tabelas + "<p class='total'>VALOR TOTAL DO PEDIDO: " + brl(pedido.total) + "</p>" +
      "<p style='font-size:8pt;color:#555'>Pedido registrado em " + data + "</p></body></html>";
    janela.document.open();
    janela.document.write(html);
    janela.document.close();
    janela.focus();
    janela.print();
  }

  return (
    <section className="space-y-5">
      <div>
        <div className="app-eyebrow">SOLICITAÇÕES REGISTRADAS</div>
        <h2 className="app-page-title">Pedidos</h2>
        <p className="text-sm text-muted-foreground">{pedidos.length} pedido(s) registrados no setor ou disponíveis para administração.</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por ata, justificativa, setor ou item..." className="pl-9" />
      </div>
      {pedidosQ.isLoading ? (
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Carregando pedidos...</div>
      ) : pedidosQ.isError ? (
        <div className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive">Não foi possível carregar os pedidos. {pedidosQ.error instanceof Error ? pedidosQ.error.message : ""}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-muted text-left"><tr><th className="p-3">Data</th><th className="p-3">Ata</th><th className="p-3">Setor</th><th className="p-3">Justificativa</th><th className="p-3">Itens</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Ação</th></tr></thead>
            <tbody>
              {filtrados.map((pedido) => {
                const ata = atasPorId.get(pedido.ata_id);
                const itens = itensDoPedido(pedido.itens);
                return (
                  <tr key={pedido.id} className="border-t">
                    <td className="p-3 whitespace-nowrap">{new Date(pedido.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="p-3"><div className="font-medium">{ata ? "Ata " + (ata.numero ?? "—") : "Ata indisponível"}</div><div className="max-w-[220px] truncate text-xs text-muted-foreground">{ata?.objeto ?? ""}</div></td>
                    <td className="p-3"><Badge variant="secondary">{setoresPorId.get(pedido.setor_id) ?? "Setor"}</Badge></td>
                    <td className="p-3"><div className="max-w-[260px] truncate">{pedido.justificativa}</div></td>
                    <td className="p-3">{itens.length}</td>
                    <td className="p-3 text-right font-medium tabular-nums">{brl(pedido.total)}</td>
                    <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => setPedidoAberto(pedido)}>Visualizar</Button></td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum pedido encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!pedidoAberto} onOpenChange={(open) => !open && setPedidoAberto(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Pedido registrado</DialogTitle></DialogHeader>
          {pedidoAberto && (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                <div><strong>Setor:</strong> {setoresPorId.get(pedidoAberto.setor_id) ?? "—"}</div>
                <div><strong>Data:</strong> {new Date(pedidoAberto.created_at).toLocaleString("pt-BR")}</div>
                <div><strong>Ata:</strong> {atasPorId.get(pedidoAberto.ata_id)?.numero ?? "—"}</div>
                <div><strong>Saldo conferido em:</strong> {dataBR(pedidoAberto.data_saldo)}</div>
                <div className="sm:col-span-2"><strong>Justificativa:</strong> {pedidoAberto.justificativa}</div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-muted text-left"><tr><th className="p-2">Código</th><th className="p-2">Descrição</th><th className="p-2">Fornecedor</th><th className="p-2 text-right">Quantidade</th><th className="p-2 text-right">Unitário</th><th className="p-2 text-right">Total</th></tr></thead>
                  <tbody>{itensDoPedido(pedidoAberto.itens).map((item, i) => <tr key={i} className="border-t"><td className="p-2">{item.codigo_item}</td><td className="p-2">{item.descricao}</td><td className="p-2">{item.fornecedor}</td><td className="p-2 text-right">{item.quantidade.toLocaleString("pt-BR")}</td><td className="p-2 text-right">{brl(item.preco_unitario)}</td><td className="p-2 text-right">{brl(item.valor_total)}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="text-right font-semibold">Total: {brl(pedidoAberto.total)}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPedidoAberto(null)}>Fechar</Button>
            {pedidoAberto && <Button onClick={() => gerarPdf(pedidoAberto)}><Printer className="h-4 w-4" /> Gerar PDF novamente</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
