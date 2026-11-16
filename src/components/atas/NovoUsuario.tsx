import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

type Setor = Tables<"setores">;

export function NovoUsuario({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [admin, setAdmin] = useState(false);
  const [setorId, setSetorId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const setoresQ = useQuery({
    queryKey: ["setores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").eq("ativo", true).order("acesso_global", { ascending: false }).order("nome");
      if (error) throw error;
      return data;
    },
    enabled: aberto,
  });
  const setores = (setoresQ.data ?? []) as Setor[];

  function limpar() {
    setEmail(""); setNome(""); setSenha(""); setAdmin(false); setSetorId("");
  }

  async function enviar() {
    if (!setorId) { toast.error("Selecione o setor de lotação do usuário."); return; }
    setSalvando(true);
    try {
      await adminApi({ action: "create-user", email, senha, admin, setor_id: setorId, nome });
      toast.success("Usuário cadastrado. No primeiro acesso, ele deverá informar o CPF.");
      limpar();
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) { limpar(); onFechar(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cadastrar novo usuário</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Senha inicial (mín. 8 caracteres)</Label><Input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Setor de lotação *</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={setorId} onChange={(e) => setSetorId(e.target.value)}>
              <option value="">Selecione o setor...</option>
              {setores.map((setor) => <option key={setor.id} value={setor.id}>{setor.acesso_global ? setor.nome + " — Acesso geral" : "↳ " + setor.nome}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Também é administrador
          </label>
          <p className="text-xs text-muted-foreground">O CPF será solicitado ao usuário no primeiro acesso. Usuários lotados em Gestão terão acesso aos dados de todos os setores, mas só serão administradores se essa opção também for marcada.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { limpar(); onFechar(); }}>Cancelar</Button>
          <Button onClick={() => void enviar()} disabled={salvando || !setorId}>{salvando ? "Cadastrando..." : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
