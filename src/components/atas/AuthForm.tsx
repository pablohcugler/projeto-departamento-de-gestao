import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminApi } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { brasaoMunicipio } from "@/lib/brasao";
import { FileText } from "lucide-react";

export function AuthForm() {
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      if (identificador.includes("@")) {
        const { error } = await supabase.auth.signInWithPassword({
          email: identificador.trim().toLowerCase(),
          password: senha,
        });
        if (error) throw error;
      } else {
        const cpf = identificador.replace(/\D/g, "");
        if (cpf.length !== 11) throw new Error("Informe um e-mail válido ou CPF com 11 dígitos.");
        const resposta = await adminApi<{ session: { access_token: string; refresh_token: string } }>({
          action: "login-cpf",
          cpf,
          senha,
        });
        const { error } = await supabase.auth.setSession({
          access_token: resposta.session.access_token,
          refresh_token: resposta.session.refresh_token,
        });
        if (error) throw error;
      }
    } catch {
      toast.error("E-mail/CPF ou senha inválidos.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <img src={brasaoMunicipio} alt="Brasão do município" className="h-16 w-16 object-contain" />
          <div>
            <h1 className="font-display text-2xl text-foreground">Departamento de Gestão em Saúde</h1>
            <p className="text-sm text-muted-foreground">Acesso Restrito</p>
          </div>
        </div>
        <form onSubmit={enviar} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="login">E-mail ou CPF</Label>
            <Input id="login" type="text" autoComplete="username" inputMode="text" required value={identificador} onChange={(e) => setIdentificador(e.target.value)} placeholder="seu e-mail ou CPF" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" autoComplete="current-password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={carregando}>
            {carregando ? "Entrando..." : "Entrar"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Use seu e-mail ou CPF cadastrado e sua senha. Novos acessos são liberados pelo administrador.</p>
        </form>
      </div>
    </div>
  );
}
