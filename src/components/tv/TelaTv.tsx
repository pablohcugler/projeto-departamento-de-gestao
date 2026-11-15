import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brasaoMunicipio } from "@/lib/brasao";
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
        const { data, error } = await supabase.from("atas").select("id,numero,objeto,fornecedor,data_vencimento,fase_processo,situacao_cadastro");
        if (error) throw error;
        for (const a of data ?? []) {
          if (a.situacao_cadastro !== "Vigentes") continue;
          linhas.push({ id: a.id, tipo: "Ata", numero: a.numero ?? "Em andamento", objeto: a.objeto, quem: a.fornecedor ?? "", venc: a.data_vencimento, dias: diasParaVencer(a.data_vencimento), fase: a.fase_processo });
        }
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
    <div className="dark min-h-screen bg-background p-4 text-foreground sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div className="flex min-w-0 items-center gap-4">
          <img src={brasaoMunicipio} alt="Brasão do município" className="h-12 w-12 shrink-0 object-contain sm:h-16 sm:w-16" />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground sm:text-sm">Departamento de Gestão em Saúde</p>
            <h1 className="font-display text-2xl font-semibold sm:text-4xl">{cfg?.titulo}</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl tabular-nums sm:text-5xl">{agora?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
          <p className="text-sm text-muted-foreground sm:text-base">{agora?.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
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
            <div key={l.tipo + l.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 sm:gap-6 sm:px-6 sm:py-4">
              <div className={`w-24 shrink-0 rounded-lg py-2 text-center sm:w-36 sm:py-3 ${corDias(l.dias)}`}>
                <p className="font-display text-2xl font-bold tabular-nums sm:text-4xl">{Math.abs(l.dias)}</p>
                <p className="text-[10px] font-semibold uppercase sm:text-xs">{l.dias < 0 ? "dias vencido" : l.dias === 0 ? "vence hoje" : "dias restantes"}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground sm:text-sm">{l.tipo} nº {l.numero}{l.quem ? ` · ${l.quem}` : ""}</p>
                <p className="truncate text-lg font-medium sm:text-2xl">{l.objeto}</p>
                {l.fase && <p className="text-sm text-primary sm:text-base">Fase: {l.fase}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground sm:text-sm">Vencimento</p>
                <p className="text-base tabular-nums sm:text-2xl">{dataBR(l.venc)}</p>
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
    <div className="rounded-xl border bg-card px-3 py-3 sm:px-6 sm:py-4">
      <p className="text-xs text-muted-foreground sm:text-base">{rotulo}</p>
      <p className={`font-display text-3xl font-bold sm:text-5xl ${classe}`}>{valor}</p>
    </div>
  );
}
