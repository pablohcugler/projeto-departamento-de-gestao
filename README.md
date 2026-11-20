# Projeto Departamento de Gestão

Sistema criado para gerenciamento de licitações do departamento de gestão.


## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Módulo Adiantamentos — notas de despesas

Cada processo de adiantamento permite cadastrar várias notas de despesas com número, data, fornecedor e descrição. Cada nota pode receber um documento fiscal em PDF ou imagem (até 15 MB). Os metadados das notas ficam em `public.adiantamento_notas`; os documentos são armazenados no bucket privado `anexos`, sob o caminho `adiantamento/{adiantamento_id}/{nota_id}/...`. A autorização dos registros e dos arquivos acompanha as permissões do setor do processo pai.

A implantação requer aplicar a migração `supabase/migrations/202611200002_adiantamento_notas.sql` no Lovable Cloud.
