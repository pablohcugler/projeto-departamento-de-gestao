import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { brasaoMunicipio } from "@/lib/brasao";
import { ShieldCheck } from "lucide-react";

function validarCpf(valor: string) {
  const cpf = valor.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9), 10) === Number(cpf[9]) && digito(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

export function CompletarCpf({ nome, onConcluido }: { nome?: string | null; onConcluido: (cpf: string) => void }) {
  const [cpf, setCpf] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const numero = cpf.replace(/\D/g, "");
    if (!validarCpf(numero)) {
      toast.error("Informe um CPF válido.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.rpc("registrar_cpf_usuario", { p_cpf: numero });
    setSalvando(false);
    if (error) {
      toast.error(error.message.includes("já está vinculado") ? "Este CPF já está cadastrado em outra conta." : error.message);
      return;
    }
    toast.success("CPF cadastrado.");
    onConcluido(numero);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <img src={brasaoMunicipio} alt="Brasão do município" className="h-14 w-14 object-contain" />
          <div><h1 className="text-xl font-semibold">Departamento de Gestão em Saúde</h1><p className="text-sm text-muted-foreground">Prefeitura de Cajati</p></div>
        </div>
        <form onSubmit={enviar} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Completar primeiro acesso</h2></div>
          <p className="text-sm text-muted-foreground">Olá{nome ? ", " + nome : ""}. Para liberar seu acesso, informe seu CPF. Esse número ficará vinculado à sua conta e poderá ser usado nos próximos logins.</p>
          <div className="space-y-2"><Label htmlFor="primeiro-cpf">CPF</Label><Input id="primeiro-cpf" autoComplete="off" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={salvando}>{salvando ? "Salvando..." : "Cadastrar CPF e continuar"}</Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => void supabase.auth.signOut()}>Sair</Button>
          <p className="text-xs text-muted-foreground">O CPF é dado pessoal e será acessível somente ao titular da conta e aos administradores autorizados.</p>
        </form>
      </div>
    </div>
  );
}
