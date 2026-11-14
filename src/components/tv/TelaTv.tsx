import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import brasao from "@/assets/brasao_municipio.png.asset.json";
import { dataBR, diasParaVencer } from "@/lib/vencimento";
import { CONFIG_TV_PADRAO, type ConfigTvValores } from "./ConfigTv";

type Linha = { id: string; tipo: "Ata" | "Contrato"; numero: string; objeto: string; quem: string; venc: string; dias: number; fase?: string | null };

function lerConfig(): ConfigTvValores {
  const p = new URLSearchParams(window.location.search);
  return {
    dias: Number(p.get("dias")) || CONFIG_TV_PADRAO.dias,
    atas: p.get("atas") !== "0",
    contratos: p.get("contratos") !== "0",
    vencidas: p.get("vencidas") !== "0",
    titulo: p.get("titulo") || CONFIG_TV_PADRAO.titulo,
  };
}

function corDias(d: number) {
  if (d < 0) return "bg-destructive text-destructive-foreground";
  if (d <= 30) return "bg-destructive/85 text-destructive-foreground";
  if (d <= 60) return "bg-warning text-warning-foreground";
  return "bg-success text-success-foreground";
}

export function TelaTv() {
  const [cfg, setCfg] = useState<ConfigTvValores | null>(null);
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setCfg(lerConfig());
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const q = useQuery({
    queryKey: ["tv", cfg],
    enabled: !!cfg,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const linhas: Linha[] = [];
      if (cfg!.atas) {
        const { data, error } = await supabase.from("atas").select("id,numero,objeto,fornecedor,data_vencimento,fase_processo");
        if (error) throw error;
        for (const a of data ?? []) linhas.push({ id: a.id, tipo: "Ata", numero: a.numero, objeto: a.objeto, quem: a.fornecedor ?? "", venc: a.data_vencimento, dias: diasParaVencer(a.data_vencimento), fase: a.fase_processo });
      }
      if (cfg!.contratos) {
        const { data, error } = await supabase.from("contratos").select("id,numero,objeto,contratado,data_vencimento");
        if (error) throw error;
        for (const c of data ?? []) linhas.push({ id: c.id, tipo: "Contrato", numero: c.numero, objeto: c.objeto, quem: c.contratado ?? "", venc: c.data_vencimento, dias: diasParaVencer(c.data_vencimento) });
      }
      return linhas;
    },
  });

  const linhas = useMemo(() => {
    if (!cfg) return [];
    return (q.data ?? []).filter((l) => l.dias <= cfg.dias && (cfg.vencidas || l.dias >= 0)).sort((a, b) => a.dias - b.dias);
  }, [q.data, cfg]);

  const vencidas = linhas.filter((l) => l.dias < 0).length;
  const ate30 = linhas.filter((l) => l.dias >= 0 && l.dias <= 30).length;

  return (
    <div className="dark min-h-screen bg-background p-8 text-foreground">
      <header className="mb-6 flex items-center justify-between border-b pb-5">
        <div className="flex items-center gap-4">
          <img src={brasao.url} alt="Brasão do município" className="h-16 w-16 object-contain" />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Departamento de Gestão em Saúde</p>
            <h1 className="font-display text-4xl font-semibold">{cfg?.titulo}</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-5xl tabular-nums">{agora?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
          <p className="text-muted-foreground">{agora?.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Resumo rotulo="Vencidos" valor={vencidas} classe="text-destructive" />
        <Resumo rotulo="Vencem em até 30 dias" valor={ate30} classe="text-warning" />
        <Resumo rotulo={`Total nos próximos ${cfg?.dias ?? ""} dias`} valor={linhas.length} classe="text-primary" />
      </div>

      {q.error ? (
        <p className="text-2xl text-destructive">Não foi possível carregar os dados. Verifique se esta tela está conectada com um usuário.</p>
      ) : linhas.length === 0 ? (
        <p className="mt-20 text-center text-3xl text-muted-foreground">{q.isLoading ? "Carregando…" : "Nenhum vencimento no período. 🎉"}</p>
      ) : (
        <div className="space-y-3">
          {linhas.map((l) => (
            <div key={l.tipo + l.id} className="flex items-center gap-6 rounded-xl border bg-card px-6 py-4">
              <div className={`w-36 shrink-0 rounded-lg py-3 text-center ${corDias(l.dias)}`}>
                <p className="font-display text-4xl font-bold tabular-nums">{Math.abs(l.dias)}</p>
                <p className="text-xs font-semibold uppercase">{l.dias < 0 ? "dias vencido" : l.dias === 0 ? "vence hoje" : "dias restantes"}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm uppercase tracking-wider text-muted-foreground">{l.tipo} nº {l.numero}{l.quem ? ` · ${l.quem}` : ""}</p>
                <p className="truncate text-2xl font-medium">{l.objeto}</p>
                {l.fase && <p className="text-base text-primary">Fase: {l.fase}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Vencimento</p>
                <p className="text-2xl tabular-nums">{dataBR(l.venc)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, classe }: { rotulo: string; valor: number; classe: string }) {
  return (
    <div className="rounded-xl border bg-card px-6 py-4">
      <p className="text-muted-foreground">{rotulo}</p>
      <p className={`font-display text-5xl font-bold ${classe}`}>{valor}</p>
    </div>
  );
}
