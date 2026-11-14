import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { extrairItensPdf } from "@/lib/importar.functions";
import { type ItemImportado, numeroBR } from "@/lib/importacao-ata";
import { linhasParaItens } from "@/lib/planilha";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { brl } from "@/lib/vencimento";

export function ImportarItens({ ataId, aberto, onFechar, onImportado }: { ataId: string; aberto: boolean; onFechar: () => void; onImportado: () => void }) {
  const extrair = useServerFn(extrairItensPdf);
  const [itens, setItens] = useState<ItemImportado[]>([]);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function arquivo(f: File) {
    setLendo(true);
    setItens([]);
    try {
      if (f.name.toLowerCase().endsWith(".pdf")) {
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const r = await extrair({ data: { base64: btoa(bin) } });
        if (r.erro) toast.error(r.erro);
        setItens(r.itens);
        if (!r.erro && r.itens.length === 0) toast.error("Nenhum item encontrado no PDF.");
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await f.arrayBuffer());
        const ws = wb.Sheets[wb.SheetNames[0]!]!;
        const lista = linhasParaItens(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws));
        if (lista.length === 0) toast.error("Não encontrei itens. Confira as colunas da planilha.");
        setItens(lista);
      }
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível ler o arquivo.");
    } finally {
      setLendo(false);
    }
  }

  const atualizar = (i: number, campo: keyof ItemImportado, v: string) => {
    setItens((atuais) => atuais.map((it, idx) => {
      if (idx !== i) return it;
      if (campo === "quantidade" || campo === "preco_unitario") {
        const numero = numeroBR(v);
        const atualizado = { ...it, [campo]: numero };
        atualizado.valor_total = atualizado.quantidade * atualizado.preco_unitario;
        return atualizado;
      }
      return { ...it, [campo]: v };
    }));
  };

  async function salvar() {
    if (itens.some((i) => !i.descricao.trim() || !i.fornecedor.trim())) {
      toast.error("Confira se todos os itens possuem descrição e fornecedor.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("ata_itens").insert(
      itens.map((i) => ({
        ata_id: ataId,
        codigo_item: i.codigo_item || null,
        codigo_produto: i.codigo_produto || null,
        descricao: i.descricao,
        fornecedor: i.fornecedor || null,
        unidade: i.unidade || "UN",
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
      })),
    );
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(itens.length + " item(ns) importado(s).");
    setItens([]);
    onImportado();
    onFechar();
  }

  const total = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-6xl">
        <DialogHeader><DialogTitle>Importar itens da ata vigente</DialogTitle></DialogHeader>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center hover:bg-accent/40">
          {lendo ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <FileUp className="h-6 w-6 text-primary" />}
          <span className="font-medium">{lendo ? "Lendo o arquivo..." : "Escolha o PDF de saldo da ata ou uma planilha (Excel/CSV)"}</span>
          <span className="text-xs text-muted-foreground">PDF JL Soft: fornecedor, código do item/produto, descrição, unidade, preço unitário, saldo e total. Planilhas: cabeçalhos equivalentes.</span>
          <input type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" disabled={lendo} onChange={(e) => { const f = e.target.files?.[0]; if (f) void arquivo(f); e.target.value = ""; }} />
        </label>

        {itens.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">Confira os dados antes de gravar: {itens.length} itens · total recalculado {brl(total)}.</p>
            <div className="max-h-[55vh] overflow-auto rounded-lg border">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="p-2 w-24">Cód. item</th>
                    <th className="p-2 w-28">Cód. produto</th>
                    <th className="p-2 min-w-[280px]">Descrição</th>
                    <th className="p-2 min-w-[220px]">Fornecedor</th>
                    <th className="p-2 w-20">Unid.</th>
                    <th className="p-2 w-24">Saldo</th>
                    <th className="p-2 w-32">Valor unit.</th>
                    <th className="p-2 w-32 text-right">Valor total</th>
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it, i) => (
                    <tr key={it.codigo_item + "-" + i} className="border-t">
                      <td className="p-1"><Input value={it.codigo_item} onChange={(e) => atualizar(i, "codigo_item", e.target.value)} /></td>
                      <td className="p-1"><Input value={it.codigo_produto} onChange={(e) => atualizar(i, "codigo_produto", e.target.value)} /></td>
                      <td className="p-1"><Input value={it.descricao} onChange={(e) => atualizar(i, "descricao", e.target.value)} /></td>
                      <td className="p-1"><Input value={it.fornecedor} onChange={(e) => atualizar(i, "fornecedor", e.target.value)} /></td>
                      <td className="p-1"><Input value={it.unidade} onChange={(e) => atualizar(i, "unidade", e.target.value)} /></td>
                      <td className="p-1"><Input value={String(it.quantidade)} onChange={(e) => atualizar(i, "quantidade", e.target.value)} /></td>
                      <td className="p-1"><Input value={String(it.preco_unitario)} onChange={(e) => atualizar(i, "preco_unitario", e.target.value)} /></td>
                      <td className="p-2 text-right tabular-nums">{brl(it.quantidade * it.preco_unitario)}</td>
                      <td className="p-1"><Button variant="ghost" size="icon" aria-label="Remover" onClick={() => setItens(itens.filter((_, x) => x !== i))}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={itens.length === 0 || salvando || lendo}>{salvando ? "Salvando..." : "Salvar " + (itens.length || "") + " itens"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
