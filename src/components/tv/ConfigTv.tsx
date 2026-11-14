import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export type ConfigTvValores = { dias: number; atas: boolean; contratos: boolean; vencidas: boolean; titulo: string };
export const CONFIG_TV_PADRAO: ConfigTvValores = { dias: 120, atas: true, contratos: true, vencidas: true, titulo: "Vencimentos próximos" };

export function urlTv(c: ConfigTvValores) {
  const p = new URLSearchParams({ dias: String(c.dias), atas: c.atas ? "1" : "0", contratos: c.contratos ? "1" : "0", vencidas: c.vencidas ? "1" : "0", titulo: c.titulo });
  return `/tv?${p.toString()}`;
}

export function ConfigTv() {
  const [aberto, setAberto] = useState(false);
  const [c, setC] = useState<ConfigTvValores>(CONFIG_TV_PADRAO);
  useEffect(() => {
    try { const s = localStorage.getItem("config-tv"); if (s) setC({ ...CONFIG_TV_PADRAO, ...JSON.parse(s) }); } catch { /* ignore */ }
  }, []);
  const abrir = () => {
    localStorage.setItem("config-tv", JSON.stringify(c));
    window.open(urlTv(c), "_blank");
    setAberto(false);
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}><Monitor className="h-4 w-4" /> Tela da TV</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tela da TV</DialogTitle>
            <DialogDescription>Escolha o que aparece na tela. Ela abre em outra aba, se atualiza sozinha e pode ficar em tela cheia (tecla F11).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Título da tela</Label><Input value={c.titulo} onChange={(e) => setC({ ...c, titulo: e.target.value })} /></div>
            <div><Label>Mostrar o que vence nos próximos (dias)</Label><Input type="number" min={1} value={c.dias} onChange={(e) => setC({ ...c, dias: Math.max(1, Number(e.target.value) || 1) })} /></div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={c.atas} onCheckedChange={(v) => setC({ ...c, atas: !!v })} /> Atas de Registro de Preço</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={c.contratos} onCheckedChange={(v) => setC({ ...c, contratos: !!v })} /> Contratos</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={c.vencidas} onCheckedChange={(v) => setC({ ...c, vencidas: !!v })} /> Incluir os já vencidos</label>
          </div>
          <DialogFooter><Button onClick={abrir} disabled={!c.atas && !c.contratos}><Monitor className="h-4 w-4" /> Abrir tela</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
