import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bug, CheckCircle2, Clock3, Lightbulb, MessageSquareText, Search, Send, ThumbsUp } from "lucide-react";

type FeedbackStatus = "Novo" | "Em análise" | "Em andamento" | "Concluído" | "Não será implementado";
type Feedback = {
  id: string; user_id: string; nome_usuario: string; email_usuario: string | null;
  categoria: string; titulo: string; descricao: string; status: FeedbackStatus;
  resposta_admin: string | null; created_at: string;
};
const statusOptions: FeedbackStatus[] = ["Novo", "Em análise", "Em andamento", "Concluído", "Não será implementado"];
const categorias = ["Sugestão", "Problema", "Dúvida", "Elogio", "Outro"];

export function EnviarFeedback({ aberto, onFechar, userId, nome }: { aberto: boolean; onFechar: () => void; userId: string; nome?: string | null }) {
  const [categoria, setCategoria] = useState("Sugestão");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !descricao.trim()) return toast.error("Preencha o assunto e a descrição.");
    setEnviando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("feedbacks_sistema").insert({
      user_id: userId, nome_usuario: nome?.trim() || user?.user_metadata?.nome || user?.email || "Usuário",
      email_usuario: user?.email ?? null, categoria, titulo: titulo.trim(), descricao: descricao.trim(),
    });
    setEnviando(false);
    if (error) return toast.error("Não foi possível enviar o feedback. Verifique se a atualização do banco foi aplicada.");
    toast.success("Feedback enviado. Obrigado por contribuir!");
    setCategoria("Sugestão"); setTitulo(""); setDescricao(""); onFechar();
  }

  return <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-primary" /> Enviar feedback</DialogTitle>
        <DialogDescription>Compartilhe uma ideia, relate um problema ou envie uma dúvida sobre o sistema.</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="feedback-categoria">Tipo de feedback</Label>
          <select id="feedback-categoria" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={categoria} onChange={e => setCategoria(e.target.value)}>
            {categorias.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="feedback-titulo">Assunto</Label><Input id="feedback-titulo" maxLength={120} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Resuma o feedback em uma frase" /></div>
        <div className="space-y-1.5"><Label htmlFor="feedback-descricao">Descrição</Label><Textarea id="feedback-descricao" maxLength={3000} rows={5} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Conte mais detalhes..." /></div>
        <DialogFooter><Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button><Button type="submit" disabled={enviando}><Send className="mr-1 h-4 w-4" />{enviando ? "Enviando..." : "Enviar feedback"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function RelatorioFeedbacks() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [selecionado, setSelecionado] = useState<Feedback | null>(null);
  const [status, setStatus] = useState<FeedbackStatus>("Novo");
  const [resposta, setResposta] = useState("");
  const q = useQuery({
    queryKey: ["feedbacks-sistema"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("feedbacks_sistema").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Feedback[];
    },
  });
  const lista = q.data ?? [];
  const filtrados = useMemo(() => lista.filter(f =>
    (filtroStatus === "Todos" || f.status === filtroStatus) &&
    `${f.titulo} ${f.descricao} ${f.nome_usuario} ${f.categoria}`.toLowerCase().includes(busca.toLowerCase())
  ), [lista, filtroStatus, busca]);
  const novos = lista.filter(f => f.status === "Novo").length;
  const emAndamento = lista.filter(f => f.status === "Em análise" || f.status === "Em andamento").length;
  const concluidos = lista.filter(f => f.status === "Concluído" || f.status === "Não será implementado").length;

  function abrir(f: Feedback) { setSelecionado(f); setStatus(f.status); setResposta(f.resposta_admin ?? ""); }
  async function atualizar() {
    if (!selecionado) return;
    const { error } = await (supabase as any).from("feedbacks_sistema").update({ status, resposta_admin: resposta.trim() || null }).eq("id", selecionado.id);
    if (error) return toast.error("Não foi possível atualizar o feedback.");
    toast.success("Feedback atualizado."); setSelecionado(null); qc.invalidateQueries({ queryKey: ["feedbacks-sistema"] });
  }
  const dataBR = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return <div className="space-y-6">
    <div><div className="app-eyebrow">ADMINISTRAÇÃO DO SISTEMA</div><h2 className="app-page-title">Relatório de feedbacks</h2><p className="text-sm text-muted-foreground">Acompanhe sugestões, dúvidas e problemas enviados pelos usuários.</p></div>
    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><MessageSquareText className="h-4 w-4" /> Total recebido</div><div className="mt-2 text-2xl font-semibold tabular-nums">{lista.length}</div></div>
      <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" /> Novos / em análise</div><div className="mt-2 text-2xl font-semibold tabular-nums">{novos + emAndamento}</div></div>
      <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Finalizados</div><div className="mt-2 text-2xl font-semibold tabular-nums">{concluidos}</div></div>
    </section>
    <div className="flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar feedback..." value={busca} onChange={e => setBusca(e.target.value)} /></div>
      <select className="h-10 rounded-md border border-input bg-card px-3 text-sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}><option>Todos</option>{statusOptions.map(s => <option key={s}>{s}</option>)}</select>
    </div>
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm"><table className="w-full text-sm">
      <thead className="bg-muted text-left text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Assunto</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
      <tbody>{filtrados.map(f => <tr key={f.id} className="border-t hover:bg-muted/40"><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dataBR(f.created_at)}</td><td className="px-4 py-3"><div className="font-medium">{f.nome_usuario}</div><div className="text-xs text-muted-foreground">{f.email_usuario || "—"}</div></td><td className="px-4 py-3">{f.categoria}</td><td className="max-w-[280px] px-4 py-3"><div className="truncate font-medium">{f.titulo}</div><div className="truncate text-xs text-muted-foreground">{f.descricao}</div></td><td className="px-4 py-3"><span className="rounded-full bg-accent px-2.5 py-1 text-xs">{f.status}</span></td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => abrir(f)}>Analisar</Button></td></tr>)}
      {filtrados.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">{q.isLoading ? "Carregando feedbacks..." : q.isError ? "Não foi possível carregar. Confirme a aplicação da migração do banco." : "Nenhum feedback encontrado."}</td></tr>}</tbody>
    </table></div>
    <Dialog open={!!selecionado} onOpenChange={v => !v && setSelecionado(null)}><DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{selecionado?.titulo}</DialogTitle><DialogDescription>{selecionado?.nome_usuario} · {selecionado?.categoria} · {selecionado ? dataBR(selecionado.created_at) : ""}</DialogDescription></DialogHeader>
      <div className="rounded-lg bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-wrap">{selecionado?.descricao}</div>
      <div className="space-y-1.5"><Label>Situação</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value as FeedbackStatus)}>{statusOptions.map(s => <option key={s}>{s}</option>)}</select></div>
      <div className="space-y-1.5"><Label>Observação / retorno administrativo</Label><Textarea rows={3} value={resposta} onChange={e => setResposta(e.target.value)} placeholder="Registre a análise ou providência adotada..." /></div>
      <DialogFooter><Button variant="outline" onClick={() => setSelecionado(null)}>Fechar</Button><Button onClick={atualizar}>Salvar análise</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
