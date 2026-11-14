-- Feedbacks do sistema: registros enviados por usuários e acompanhamento administrativo.
create table if not exists public.feedbacks_sistema (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_usuario text not null default '',
  email_usuario text,
  categoria text not null check (categoria in ('Sugestão', 'Problema', 'Dúvida', 'Elogio', 'Outro')),
  titulo text not null,
  descricao text not null,
  status text not null default 'Novo' check (status in ('Novo', 'Em análise', 'Em andamento', 'Concluído', 'Não será implementado')),
  resposta_admin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedbacks_sistema enable row level security;

drop policy if exists "Usuários enviam feedback próprio" on public.feedbacks_sistema;
create policy "Usuários enviam feedback próprio"
on public.feedbacks_sistema for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Administradores visualizam feedbacks" on public.feedbacks_sistema;
create policy "Administradores visualizam feedbacks"
on public.feedbacks_sistema for select to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Administradores atualizam feedbacks" on public.feedbacks_sistema;
create policy "Administradores atualizam feedbacks"
on public.feedbacks_sistema for update to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create index if not exists feedbacks_sistema_created_at_idx
on public.feedbacks_sistema (created_at desc);
create index if not exists feedbacks_sistema_status_idx
on public.feedbacks_sistema (status);
