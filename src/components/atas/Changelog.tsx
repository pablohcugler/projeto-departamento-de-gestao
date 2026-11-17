import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History, PackageCheck } from "lucide-react";
import { HISTORICO_ATUALIZACOES, VERSAO_SISTEMA } from "@/lib/release-notes";

export function ChangelogDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Novidades da versão
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
          <div>
            <div className="text-xs text-muted-foreground">Versão atual do sistema</div>
            <div className="text-lg font-semibold tabular-nums">{VERSAO_SISTEMA}</div>
          </div>
          <Badge><PackageCheck className="mr-1 h-3.5 w-3.5" /> Atualizado</Badge>
        </div>
        <div className="space-y-4">
          {HISTORICO_ATUALIZACOES.map((nota, indice) => (
            <article key={nota.versao} className="relative rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{nota.titulo}</div>
                <div className="flex items-center gap-2">
                  {indice === 0 && <Badge variant="secondary">Atual</Badge>}
                  <Badge variant="outline">v{nota.versao}</Badge>
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{nota.data}</div>
              <p className="mt-3 text-sm">{nota.descricao}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {nota.itens.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
