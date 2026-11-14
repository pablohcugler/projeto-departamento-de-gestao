import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { primeiroNome, saudacaoPorHora } from "@/lib/saudacao-utils";

/** "Bom dia, Pablo" no cabeçalho. O nome fica em user_metadata.nome e o próprio usuário pode alterá-lo. */
export function Saudacao({ nome, admin }: { nome?: string | null; admin: boolean }) {
  const [saudacao, setSaudacao] = useState("");
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Calculada no navegador (horário local) e renovada a cada minuto, para trocar sozinha ao virar o período.
  useEffect(() => {
    const atualizar = () => setSaudacao(saudacaoPorHora());
    atualizar();
    const t = setInterval(atualizar, 60_000);
    return () => clearInterval(t);
  }, []);

  const primeiro = primeiroNome(nome);

  async function salvar() {
    const limpo = valor.trim().replace(/\s+/g, " ");
    if (!limpo) return toast.error("Informe seu nome.");
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ data: { nome: limpo } });
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar o nome.");
    toast.success("Nome atualizado.");
    setAberto(false);
  }

  return (
    <>
      <span className="hidden items-center gap-1 sm:inline-flex">
        <span>{saudacao}{primeiro ? `, ${primeiro}` : ""}{admin ? " · Administrador" : ""}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={primeiro ? "Alterar meu nome" : "Informar meu nome"}
          title={primeiro ? "Alterar meu nome" : "Informar meu nome"}
          onClick={() => { setValor(nome ?? ""); setAberto(true); }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </span>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Como devemos te chamar?</DialogTitle>
            <DialogDescription>Usamos seu nome na saudação do topo. O primeiro nome é o que aparece.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="nome-usuario">Seu nome</Label>
            <Input id="nome-usuario" value={valor} maxLength={80} autoFocus onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void salvar()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
