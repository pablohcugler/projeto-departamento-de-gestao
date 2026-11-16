import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export type LayoutTv = "destaque-esquerda" | "tres-colunas" | "duas-colunas";
export type QuadroInferiorTv = "indicadores" | "pedidos" | "atas-andamento" | "atas-vencidas";
export type ConfigTvValores = {
  dias: number;
  atas: boolean;
  contratos: boolean;
  vencidas: boolean;
  titulo: string;
  layout: LayoutTv;
  quadroInferior: QuadroInferiorTv;
};
export const CONFIG_TV_PADRAO: ConfigTvValores = {
  dias: 120,
  atas: true,
  contratos: true,
  vencidas: true,
  titulo: "Acompanhamento de vencimentos",
  layout: "destaque-esquerda",
  quadroInferior: "indicadores",
};

const LAYOUTS: { value: LayoutTv; label: string; description: string }[] = [
  { value: "destaque-esquerda", label: "3 quadros — Atas em destaque", description: "Atas ocupam toda a esquerda; contratos e quadro personalizável ficam à direita." },
  { value: "tres-colunas", label: "3 quadros — Colunas iguais", description: "Atas, contratos e quadro personalizável lado a lado." },
  { value: "duas-colunas", label: "2 quadros — Atas e contratos", description: "Tela dividida entre atas e contratos, sem terceiro quadro." },
];

const QUADROS: { value: QuadroInferiorTv; label: string; description: string }[] = [
  { value: "indicadores", label: "Indicadores gerais", description: "Totais de atas, contratos e prazos." },
  { value: "pedidos", label: "Pedidos recentes", description: "Últimos pedidos registrados no setor." },
  { value: "atas-andamento", label: "Atas em andamento", description: "Atas que ainda não estão vigentes." },
  { value: "atas-vencidas", label: "Atas vencidas", description: "Atas vigentes no cadastro cuja data de vencimento já passou." },
];

export function urlTv(c: ConfigTvValores) {
  const p = new URLSearchParams({ dias: String(c.dias), atas: c.atas ? "1" : "0", contratos: c.contratos ? "1" : "0", vencidas: c.vencidas ? "1" : "0", titulo: c.titulo, layout: c.layout, quadro: c.quadroInferior });
  return `/tv?${p.toString()}`;
}

export function ConfigTv({ menuTrigger = false }: { menuTrigger?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [c, setC] = useState<ConfigTvValores>(CONFIG_TV_PADRAO);
  useEffect(() => {
    try { const s = localStorage.getItem("config-tv"); if (s) setC({ ...CONFIG_TV_PADRAO, ...JSON.parse(s) }); } catch { /* ignore */ }
  }, []);
  const abrir = () => {
    try { localStorage.setItem("config-tv", JSON.stringify(c)); } catch { /* ignore */ }
    // O clique abre a Tela da TV em uma nova aba e mantém o painel principal aberto.
    window.open(urlTv(c), "_blank", "noopener,noreferrer");
  };
  return (
    <>
      {menuTrigger ? <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setAberto(true); }}><Monitor className="h-4 w-4" /> Tela da TV</DropdownMenuItem> : <Button variant="outline" size="sm" onClick={() => setAberto(true)}><Monitor className="h-4 w-4" /> Tela da TV</Button>}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tela da TV</DialogTitle>
            <DialogDescription>Monte a composição dos quadros. As atas do quadro principal serão sempre somente as vigentes, ordenadas pelo vencimento mais próximo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Título da tela</Label><Input value={c.titulo} onChange={(e) => setC({ ...c, titulo: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Layout da tela</Label>
              {LAYOUTS.map((layout) => (
                <label key={layout.value} className={c.layout === layout.value ? "flex cursor-pointer items-start gap-3 rounded-lg border border-primary bg-primary/5 p-3" : "flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50"}>
                  <input type="radio" name="layout-tv" className="mt-1 accent-primary" checked={c.layout === layout.value} onChange={() => setC({ ...c, layout: layout.value })} />
                  <span><span className="block text-sm font-medium">{layout.label}</span><span className="block text-xs text-muted-foreground">{layout.description}</span></span>
                </label>
              ))}
            </div>
            {c.layout !== "duas-colunas" && (
              <div className="space-y-1.5">
                <Label>Conteúdo do terceiro quadro</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={c.quadroInferior} onChange={(e) => setC({ ...c, quadroInferior: e.target.value as QuadroInferiorTv })}>
                  {QUADROS.map((quadro) => <option key={quadro.value} value={quadro.value}>{quadro.label}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">{QUADROS.find((quadro) => quadro.value === c.quadroInferior)?.description}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Mostrar vencimentos dentro dos próximos dias</Label>
              <Input type="number" min={1} max={730} value={c.dias} onChange={(e) => setC({ ...c, dias: Math.min(730, Math.max(1, Number(e.target.value) || 1)) })} />
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={c.vencidas} onCheckedChange={(v) => setC({ ...c, vencidas: !!v })} /> Incluir registros já vencidos nas listas</label>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Os dados são atualizados automaticamente a cada 5 minutos. Use F11 para ocupar a tela inteira do televisor.</div>
          </div>
          <DialogFooter><Button onClick={abrir} disabled={!c.layout || (!c.atas && !c.contratos)}><Monitor className="h-4 w-4" /> Exibir painel da TV</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
