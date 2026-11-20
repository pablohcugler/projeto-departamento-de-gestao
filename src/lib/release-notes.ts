export const VERSAO_SISTEMA = "1.0.6";

export type NotaVersao = {
  versao: string;
  data: string;
  titulo: string;
  descricao: string;
  itens: string[];
};

export const HISTORICO_ATUALIZACOES: NotaVersao[] = [
  {
    versao: "1.0.6",
    data: "20/11/2026",
    titulo: "Módulo de Adiantamentos",
    descricao: "Inicia o cadastro e acompanhamento dos processos de adiantamento financeiro recebidos.",
    itens: [
      "Novo cadastro de processo com número 1Doc, data de recebimento, período de aplicação e número do empenho.",
      "Cálculo automático do vencimento pela soma da data de recebimento com o período de aplicação em dias.",
      "Lista pesquisável dos processos cadastrados, com identificação dos vencidos.",
      "Acesso aos registros limitado conforme as permissões de setor do usuário.",
      "Inclusão dos registros de adiantamento no backup administrativo do sistema.",
    ],
  },
  {
    versao: "1.0.5",
    data: "16/11/2026",
    titulo: "Ajustes de feedback e identificação dos módulos",
    descricao: "Alinha a versão registrada nos feedbacks à versão oficial do sistema e atualiza os textos dos módulos.",
    itens: [
      "O formulário de feedback passa a utilizar a versão oficial compartilhada pelo sistema, evitando divergências.",
      "O módulo Ofícios passa a exibir a identificação GESTÃO DE DOCUMENTOS.",
      "O cartão de Adiantamentos passa a exibir Em manutenção.",
    ],
  },
  {
    versao: "1.0.4",
    data: "16/11/2026",
    titulo: "Gestão do sistema e módulo Ofícios",
    descricao: "Adiciona controle administrativo da integração BLL e apresenta o novo módulo de Ofícios.",
    itens: [
      "Nova área Gestão do sistema no Painel do administrador.",
      "Controle global para ativar ou desativar a integração BLL, ocultando campos, avisos e status quando desativada.",
      "Números de edital já cadastrados são preservados ao desativar a integração.",
      "Novo módulo Ofícios para acompanhamento de ofícios externos, Tribunal de Justiça, Ministério Público e Câmara, com status Em manutenção.",
    ],
  },
  {
    versao: "1.0.3",
    data: "16/11/2026",
    titulo: "Novidades da versão",
    descricao: "Ajuste do nome do histórico de atualizações no menu do usuário e na janela do changelog.",
    itens: [
      "O atalho do menu do usuário agora se chama Novidades da versão.",
      "O título da janela de histórico foi padronizado com a mesma descrição.",
    ],
  },
  {
    versao: "1.0.2",
    data: "16/11/2026",
    titulo: "Painel do administrador",
    descricao: "Centralização das ferramentas de administração e segurança.",
    itens: [
      "Nova área com Gestão de usuários, Backup do sistema e Gestão de atas.",
      "CPFs completos visíveis somente no painel restrito a administradores.",
      "Exportação de backup ZIP com tabelas do sistema e documentos anexados.",
      "Importação em massa e exclusão individual ou em lote de atas, com confirmação por senha.",
    ],
  },
  {
    versao: "1.0.1",
    data: "16/11/2026",
    titulo: "Aprimoramentos nos pedidos",
    descricao: "Melhorias na identificação de produtos e no controle de exclusões.",
    itens: [
      "Exibição do código do produto nos pedidos e em seus PDFs.",
      "Exclusão individual de pedidos com confirmação por senha.",
      "Confirmação de exclusão de atas com aviso sobre pedidos vinculados.",
    ],
  },
];
