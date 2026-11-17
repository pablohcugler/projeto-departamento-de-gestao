import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brasaoMunicipio } from "@/lib/brasao";
import { brl, dataBR, diasParaVencer } from "@/lib/vencimento";
import { CONFIG_TV_PADRAO, type ConfigTvValores, type QuadroInferiorTv } from "./ConfigTv";
import {
  CalendarClock,
  ClipboardList,
  FileCheck2,
  FileText,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Wallet,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

type LinhaTv = {
  id: string;
  numero: string;
  objeto: string;
  quem: string;
  vencimento: string;
  dias: number;
  fase?: string | null;
};

type DadosTv = {
  atas: Array<{
    id: string;
    numero: string | null;
    objeto: string;
    fornecedor: string | null;
    data_vencimento: string;
    fase_processo: string | null;
    situacao_cadastro: string;
  }>;
  contratos: Array<{
    id: string;
    numero: string;
    objeto: string;
    contratado: string | null;
    data_vencimento: string;
    situacao_cadastro: string;
  }>;
  pedidos: Array<{
    id: string;
    created_at: string;
    justificativa: string;
    total: number;
    ata_id: string;
  }>;
};

function lerConfig(): ConfigTvValores {
  const p = new URLSearchParams(window.location.search);
  let salvo: Partial<ConfigTvValores> = {};
  try {
    const local = localStorage.getItem("config-tv");
    if (local) salvo = JSON.parse(local) as Partial<ConfigTvValores>;
  } catch {
    // Mantém os valores padrões.
  }

  const layout = p.get("layout") ?? salvo.layout ?? CONFIG_TV_PADRAO.layout;
  const quadro = p.get("quadro") ?? salvo.quadroInferior ?? CONFIG_TV_PADRAO.quadroInferior;
  const layouts = ["destaque-esquerda", "tres-colunas", "duas-colunas"];
  const quadros = ["indicadores", "pedidos", "atas-andamento", "atas-vencidas"];

  return {
    dias: Math.min(730, Math.max(1, Number(p.get("dias")) || Number(salvo.dias) || CONFIG_TV_PADRAO.dias)),
    atas: true,
    contratos: true,
    vencidas: p.has("vencidas") ? p.get("vencidas") !== "0" : salvo.vencidas !== false,
    titulo: p.get("titulo") || salvo.titulo || CONFIG_TV_PADRAO.titulo,
    layout: layouts.includes(layout) ? layout as ConfigTvValores["layout"] : CONFIG_TV_PADRAO.layout,
    quadroInferior: quadros.includes(quadro) ? quadro as ConfigTvValores["quadroInferior"] : CONFIG_TV_PADRAO.quadroInferior,
  };
}

function corDias(dias: number) {
  if (dias < 0) return "bg-rose-500/15 text-rose-300 border-rose-400/30";
  if (dias <= 30) return "bg-rose-500/15 text-rose-300 border-rose-400/30";
  if (dias <= 60) return "bg-amber-500/15 text-amber-200 border-amber-400/30";
  return "bg-emerald-500/15 text-emerald-200 border-emerald-400/30";
}

function textoDias(dias: number) {
  if (dias < 0) return "vencido há " + Math.abs(dias) + " dia(s)";
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "falta 1 dia";
  return "faltam " + dias + " dias";
}

function ordenarPorVencimento<T extends { dias: number }>(itens: T[]) {
  return [...itens].sort((a, b) => a.dias - b.dias);
}

function Quadro({
  titulo,
  subtitulo,
  quantidade,
  icone,
  children,
  className = "",
}: {
  titulo: string;
  subtitulo?: string;
  quantidade?: number | undefined;
  icone: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-xl " + className}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-200">{icone}</span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold uppercase tracking-[0.12em] text-white sm:text-base">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 truncate text-xs text-slate-400">{subtitulo}</p>}
          </div>
        </div>
        {quantidade !== undefined && (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold tabular-nums text-slate-100">{quantidade}</span>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">{children}</div>
    </section>
  );
}

function ListaVencimentos({ itens, vazio }: { itens: LinhaTv[]; vazio: string }) {
  if (!itens.length) {
    return (
      <div className="flex h-full min-h-28 flex-col items-center justify-center gap-2 text-center text-slate-400">
        <CheckCircle2 className="h-8 w-8 text-emerald-300/70" />
        <p className="text-sm">{vazio}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {itens.map((item) => (
        <article key={item.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-white">{item.numero}</p>
            <span className={"rounded-full border px-2.5 py-1 text-xs font-semibold " + corDias(item.dias)}>{textoDias(item.dias)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-slate-200">{item.objeto}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span className="truncate">{item.quem || "Fornecedor não informado"}</span>
            <span className="shrink-0 tabular-nums">Vencimento: {dataBR(item.vencimento)}</span>
          </div>
          {item.fase && <p className="mt-1 text-xs text-teal-200">Fase: {item.fase}</p>}
        </article>
      ))}
    </div>
  );
}

export function TelaTv() {
  const [cfg, setCfg] = useState<ConfigTvValores | null>(null);
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    setCfg(lerConfig());
    setAgora(new Date());
    const timer = window.setInterval(() => setAgora(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const q = useQuery({
    queryKey: ["tv-painel", cfg?.dias, cfg?.vencidas, cfg?.quadroInferior],
    enabled: !!cfg,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async (): Promise<DadosTv> => {
      const incluiEmAndamento = cfg?.quadroInferior === "atas-andamento";
      const statusAta = incluiEmAndamento ? ["Vigentes", "Em andamento"] : ["Vigentes"];
      const [atasResult, contratosResult, pedidosResult] = await Promise.all([
        supabase
          .from("atas")
          .select("id,numero,objeto,fornecedor,data_vencimento,fase_processo,situacao_cadastro")
          .in("situacao_cadastro", statusAta)
          .order("data_vencimento", { ascending: true })
          .limit(500),
        supabase
          .from("contratos")
          .select("id,numero,objeto,contratado,data_vencimento,situacao_cadastro")
          .order("data_vencimento", { ascending: true })
          .limit(500),
        cfg?.quadroInferior === "pedidos"
          ? supabase.from("pedidos").select("id,created_at,justificativa,total,ata_id").order("created_at", { ascending: false }).limit(8)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (atasResult.error) throw atasResult.error;
      if (contratosResult.error) throw contratosResult.error;
      if (pedidosResult.error) throw pedidosResult.error;

      return {
        atas: atasResult.data ?? [],
        contratos: contratosResult.data ?? [],
        pedidos: pedidosResult.data ?? [],
      };
    },
  });

  const atasVigentes = useMemo(() => {
    if (!cfg) return [];
    const agoraDia = agora ?? new Date();
    return ordenarPorVencimento((q.data?.atas ?? [])
      .filter((ata) => ata.situacao_cadastro === "Vigentes")
      .map((ata) => ({
        id: ata.id,
        numero: "Ata " + (ata.numero ?? "—"),
        objeto: ata.objeto,
        quem: ata.fornecedor ?? "",
        vencimento: ata.data_vencimento,
        dias: diasParaVencer(ata.data_vencimento, agoraDia),
        fase: ata.fase_processo,
      }))
      .filter((ata) => ata.dias <= cfg.dias && (cfg.vencidas || ata.dias >= 0)));
  }, [q.data, cfg, agora]);

  const contratos = useMemo(() => {
    if (!cfg) return [];
    const agoraDia = agora ?? new Date();
    return ordenarPorVencimento((q.data?.contratos ?? [])
      .map((contrato) => ({
        id: contrato.id,
        numero: "Contrato " + contrato.numero,
        objeto: contrato.objeto,
        quem: contrato.contratado ?? "",
        vencimento: contrato.data_vencimento,
        dias: diasParaVencer(contrato.data_vencimento, agoraDia),
      }))
      .filter((contrato) => contrato.dias <= cfg.dias && (cfg.vencidas || contrato.dias >= 0)));
  }, [q.data, cfg, agora]);

  const atasEmAndamento = useMemo(() => {
    const agoraDia = agora ?? new Date();
    return ordenarPorVencimento((q.data?.atas ?? [])
      .filter((ata) => ata.situacao_cadastro === "Em andamento")
      .map((ata) => ({
        id: ata.id,
        numero: "Ata " + (ata.numero ?? "Em andamento"),
        objeto: ata.objeto,
        quem: ata.fornecedor ?? "",
        vencimento: ata.data_vencimento,
        dias: diasParaVencer(ata.data_vencimento, agoraDia),
        fase: ata.fase_processo,
      })));
  }, [q.data, agora]);

  const atasVencidas = useMemo(() => atasVigentes.filter((ata) => ata.dias < 0), [atasVigentes]);
  const vencemEm30 = atasVigentes.filter((ata) => ata.dias >= 0 && ata.dias <= 30).length
    + contratos.filter((contrato) => contrato.dias >= 0 && contrato.dias <= 30).length;
  const dataAtualizacao = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

  function conteudoQuadroInferior(tipo: QuadroInferiorTv) {
    if (tipo === "pedidos") {
      const pedidos = q.data?.pedidos ?? [];
      return pedidos.length ? (
        <div className="space-y-2">
          {pedidos.map((pedido) => (
            <article key={pedido.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">{new Date(pedido.created_at).toLocaleDateString("pt-BR")}</span>
                <span className="text-sm font-semibold text-emerald-200">{brl(Number(pedido.total))}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-200">{pedido.justificativa}</p>
            </article>
          ))}
        </div>
      ) : <p className="py-8 text-center text-sm text-slate-400">Nenhum pedido recente.</p>;
    }

    if (tipo === "atas-andamento") {
      return <ListaVencimentos itens={atasEmAndamento} vazio="Nenhuma ata em andamento." />;
    }

    if (tipo === "atas-vencidas") {
      return <ListaVencimentos itens={ordenarPorVencimento(atasVencidas)} vazio="Nenhuma ata vencida." />;
    }

    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <p className="text-xs text-slate-400">Atas vigentes</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">{atasVigentes.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <p className="text-xs text-slate-400">Contratos</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">{contratos.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <p className="text-xs text-slate-400">Atas vencidas</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-rose-300">{atasVencidas.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <p className="text-xs text-slate-400">Vencem em até 30 dias</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-200">{vencemEm30}</p>
        </div>
      </div>
    );
  }

  const tituloQuadro = cfg?.quadroInferior === "pedidos"
    ? "Pedidos recentes"
    : cfg?.quadroInferior === "atas-andamento"
      ? "Atas em andamento"
      : cfg?.quadroInferior === "atas-vencidas"
        ? "Atas vencidas"
        : "Indicadores gerais";

  const iconeQuadro = cfg?.quadroInferior === "pedidos"
    ? <ShoppingCart className="h-5 w-5" />
    : cfg?.quadroInferior === "atas-andamento"
      ? <ClipboardList className="h-5 w-5" />
      : cfg?.quadroInferior === "atas-vencidas"
        ? <AlertTriangle className="h-5 w-5" />
        : <TrendingUp className="h-5 w-5" />;

  const quadroAtas = (
    <Quadro titulo="Atas de Registro de Preços" subtitulo="Somente atas vigentes · vencimento mais próximo primeiro" quantidade={atasVigentes.length} icone={<FileText className="h-5 w-5" />}>
      {q.isLoading ? <p className="py-10 text-center text-sm text-slate-400">Carregando atas vigentes...</p> : <ListaVencimentos itens={atasVigentes} vazio="Nenhuma ata vigente no período selecionado." />}
    </Quadro>
  );

  const quadroContratos = (
    <Quadro titulo="Contratos" subtitulo="Vencimento mais próximo primeiro" quantidade={contratos.length} icone={<FileCheck2 className="h-5 w-5" />}>
      {q.isLoading ? <p className="py-8 text-center text-sm text-slate-400">Carregando contratos...</p> : <ListaVencimentos itens={contratos} vazio="Nenhum contrato no período selecionado." />}
    </Quadro>
  );

  const quadroExtra = (
    <Quadro titulo={tituloQuadro} subtitulo="Quadro selecionado na configuração da TV" quantidade={cfg?.quadroInferior === "pedidos" ? q.data?.pedidos.length ?? 0 : undefined} icone={iconeQuadro}>
      {q.isLoading ? <p className="py-8 text-center text-sm text-slate-400">Carregando informações...</p> : cfg ? conteudoQuadroInferior(cfg.quadroInferior) : null}
    </Quadro>
  );

  return (
    <div className="dark min-h-screen bg-[#07141d] p-3 text-white sm:p-5 lg:h-screen lg:overflow-hidden">
      <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src={brasaoMunicipio} alt="Brasão do município" className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-200 sm:text-xs">Departamento de Gestão em Saúde · Prefeitura de Cajati</p>
            <h1 className="truncate font-display text-xl font-semibold sm:text-2xl">{cfg?.titulo}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-display text-2xl font-semibold tabular-nums sm:text-4xl">{agora?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
            <p className="text-xs capitalize text-slate-400">{agora?.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
          </div>
          <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 md:flex">
            <RefreshCw className="h-3.5 w-3.5 text-teal-200" /> Atualizado às {dataAtualizacao}
          </div>
        </div>
      </header>

      {q.error && (
        <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          Não foi possível carregar todos os dados desta tela. Verifique a conexão e as permissões do seu setor.
        </div>
      )}

      {cfg?.layout === "destaque-esquerda" && (
        <main className="grid min-h-[calc(100vh-112px)] grid-cols-1 gap-3 lg:h-[calc(100vh-112px)] lg:min-h-0 lg:grid-cols-12">
          <div className="min-h-[55vh] lg:col-span-7 lg:min-h-0">{quadroAtas}</div>
          <div className="grid min-h-[55vh] grid-rows-2 gap-3 lg:col-span-5 lg:min-h-0">{quadroContratos}{quadroExtra}</div>
        </main>
      )}

      {cfg?.layout === "tres-colunas" && (
        <main className="grid min-h-[calc(100vh-112px)] grid-cols-1 gap-3 lg:h-[calc(100vh-112px)] lg:min-h-0 lg:grid-cols-3">
          {quadroAtas}
          {quadroContratos}
          {quadroExtra}
        </main>
      )}

      {cfg?.layout === "duas-colunas" && (
        <main className="grid min-h-[calc(100vh-112px)] grid-cols-1 gap-3 lg:h-[calc(100vh-112px)] lg:min-h-0 lg:grid-cols-2">
          {quadroAtas}
          {quadroContratos}
        </main>
      )}
    </div>
  );
}
