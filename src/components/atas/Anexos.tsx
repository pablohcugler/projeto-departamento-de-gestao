import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const TIPOS_DOC = ["Termo de Referência", "Estudo Técnico Preliminar", "Contrato"] as const;

export function Anexos({ refTipo, refId }: { refTipo: "ata" | "contrato"; refId?: string | undefined }) {
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const q = useQuery({
    queryKey: ["anexos", refTipo, refId],
    enabled: !!refId,
    queryFn: async () => {
      const { data, error } = await supabase.from("anexos").select("*").eq("ref_tipo", refTipo).eq("ref_id", refId!).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  if (!refId) return <p className="text-sm text-muted-foreground">Salve primeiro para poder anexar documentos.</p>;

  const enviar = async (tipo: string, file?: File) => {
    if (!file) return;
    setEnviando(tipo);
    const seguro = file.name.normalize("NFD").replace(/[^\w.\-]+/g, "_");
    const caminho = `${refTipo}/${refId}/${Date.now()}_${seguro}`;
    const up = await supabase.storage.from("anexos").upload(caminho, file);
    if (up.error) { setEnviando(null); toast.error("Falha ao enviar: " + up.error.message); return; }
    const { error } = await supabase.from("anexos").insert({ ref_tipo: refTipo, ref_id: refId, tipo_doc: tipo, nome: file.name, caminho });
    setEnviando(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Documento anexado");
    qc.invalidateQueries({ queryKey: ["anexos", refTipo, refId] });
  };

  const baixar = async (caminho: string) => {
    const { data, error } = await supabase.storage.from("anexos").createSignedUrl(caminho, 300);
    if (error || !data) { toast.error("Não foi possível abrir o arquivo"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const remover = async (id: string, caminho: string) => {
    if (!confirm("Remover este anexo?")) return;
    const { error } = await supabase.from("anexos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await supabase.storage.from("anexos").remove([caminho]);
    qc.invalidateQueries({ queryKey: ["anexos", refTipo, refId] });
  };

  return (
    <div className="space-y-2">
      {TIPOS_DOC.map((tipo) => {
        const docs = (q.data ?? []).filter((d) => d.tipo_doc === tipo);
        return (
          <div key={tipo} className="rounded-md border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4 text-muted-foreground" />{tipo}</span>
              <input type="file" className="hidden" ref={(el) => { inputs.current[tipo] = el; }} onChange={(e) => { void enviar(tipo, e.target.files?.[0]); e.target.value = ""; }} />
              <Button type="button" size="sm" variant="outline" disabled={enviando === tipo} onClick={() => inputs.current[tipo]?.click()}>
                <Upload className="h-4 w-4" /> {enviando === tipo ? "Enviando…" : "Anexar"}
              </Button>
            </div>
            {docs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <button type="button" className="flex min-w-0 items-center gap-1 text-primary hover:underline" onClick={() => baixar(d.caminho)}>
                      <Download className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{d.nome}</span>
                    </button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => remover(d.id, d.caminho)} aria-label="Remover anexo"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
