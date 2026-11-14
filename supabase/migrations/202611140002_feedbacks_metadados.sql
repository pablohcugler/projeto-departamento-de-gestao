-- Metadados automáticos e observação do formulário de feedback.
alter table public.feedbacks_sistema
  add column if not exists observacao text,
  add column if not exists app_version text not null default '1.0.1';

-- Compatibilidade com feedbacks já cadastrados antes da inclusão do campo observação.
update public.feedbacks_sistema
set observacao = descricao
where observacao is null;
