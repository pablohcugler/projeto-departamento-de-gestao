import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import brasao from "@/assets/brasao_municipio.png.asset.json";
import { FileText } from "lucide-react";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) toast.error("E-mail ou senha inválidos.");
    setCarregando(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <img src={brasao.url} alt="Brasão do município" className="h-16 w-16 object-contain" />
          <div>
            <h1 className="font-display text-2xl text-foreground">Departamento de Gestão em Saúde</h1>
            <p className="text-sm text-muted-foreground">Acesso Restrito</p>
          </div>
        </div>
        <form onSubmit={enviar} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={carregando}>
            Entrar
          </Button>
          <p className="text-center text-xs text-muted-foreground">Novos acessos são liberados pelo administrador.</p>
        </form>
      </div>
    </div>
  );
}
