import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { criarUsuario } from "@/lib/usuarios.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export function NovoUsuario({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const criar = useServerFn(criarUsuario);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [admin, setAdmin] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function enviar() {
    setSalvando(true);
    try {
      await criar({ data: { email, senha, admin } });
      toast.success(`Usuário ${email} cadastrado. Já pode entrar com a senha informada.`);
      setEmail(""); setSenha(""); setAdmin(false);
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    }
    setSalvando(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cadastrar novo usuário</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Senha inicial (mín. 8 caracteres)</Label><Input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Também é administrador
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={salvando}>Cadastrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
