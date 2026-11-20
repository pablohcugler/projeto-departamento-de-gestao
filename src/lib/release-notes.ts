export const VERSAO_SISTEMA = "1.0.14";

export type NotaVersao = {
  versao: string;
  data: string;
  titulo: string;
  descricao: string;
  itens: string[];
};

export const HISTORICO_ATUALIZACOES: NotaVersao[] = [
  {
    versao: "1.0.14",
    data: "20/11/2026",
    titulo: "Reabertura de adiantamentos para ajustes",
    descricao: "Permite reabrir prestações de contas finalizadas, preservando notas e valores e registrando a operação no histórico.",
    itens: [
      "Novo botão Abrir para ajustes no resumo de execução financeira de processos finalizados.",
      "Confirmação explícita antes de reabrir o processo.",
      "Reabertura preserva notas fiscais, documentos e valores já informados.",
      "Após reabrir, o usuário pode incluir notas, ajustar valores e editar os dados do processo.",
      "Histórico registra a data da finalização anterior, o usuário que reabriu e a data da reabertura.",
    ],
  },
  {
    versao: "1.0.13",
    data: "20/11/2026",
    titulo: "Valor recebido no cadastro de adiantamento",
    descricao: "O formulário Novo processo passa a solicitar o valor total recebido para o processo.",
    itens: [
      "Campo obrigatório para informar o valor do adiantamento recebido em reais.",
      "O valor é gravado diretamente no processo e reutilizado no resumo da execução financeira e no cadastro das notas.",
      "Entrada aceita no padrão monetário brasileiro, por exemplo R$ 3.500,00.",
    ],
  },
  {
    versao: "1.0.12",
    data: "20/11/2026",
    titulo: "Destaque visual da finalização do adiantamento",
    descricao: "Aplica destaque vermelho ao botão de finalização para reforçar que a ação encerra a prestação de contas.",
    itens: [
      "O botão Finalizar adiantamento passa a utilizar a cor vermelha.",
      "Após a finalização, a ação Ver resumo financeiro permanece com aparência neutra.",
    ],
  },
  {
    versao: "1.0.11",
    data: "20/11/2026",
    titulo: "Execução financeira e finalização de adiantamentos",
    descricao: "Inclui valores recebidos e despesas individuais, com demonstrativo de execução financeira e confirmação do encerramento.",
    itens: [
      "Campo para informar o valor recebido no cadastro de cada nova nota.",
      "Campo de valor individual da despesa e possibilidade de completar valores em notas cadastradas anteriormente.",
      "Demonstrativo com valor recebido, relação de notas, total executado e valor a devolver.",
      "Confirmação Sim/Não antes de finalizar; a opção Não retorna ao processo.",
      "Após a finalização, processo e notas ficam bloqueados para alterações.",
      "Valores monetários aceitam e exibem o padrão brasileiro (R$).",
    ],
  },
  {
    versao: "1.0.10",
    data: "20/11/2026",
    titulo: "Aviso de vencimento no processo de adiantamento",
    descricao: "Reposiciona a contagem de prazo da prestação de contas logo abaixo do botão Nova nota.",
    itens: [
      "Informativo compacto e visível no canto superior direito do processo.",
      "Mostra dias restantes, vencimento no dia ou dias em atraso e a data limite.",
    ],
  },
  {
    versao: "1.0.9",
    data: "20/11/2026",
    titulo: "Contagem inclusiva do prazo de adiantamento",
    descricao: "Destaca quantos dias faltam para enviar a prestação de contas e passa a contar o dia do recebimento como o primeiro dia do prazo.",
    itens: [
      "Painel de prazo no detalhe do processo, com dias restantes, vencimento hoje ou dias em atraso.",
      "Cálculo inclusivo da data de vencimento: recebimento + período de aplicação - 1 dia.",
      "Migração para corrigir os vencimentos dos processos já cadastrados e validar a nova regra no banco.",
    ],
  },
  {
    versao: "1.0.8",
    data: "20/11/2026",
    titulo: "Lista cronológica de notas de despesas",
    descricao: "Organiza as notas de cada processo de adiantamento em ordem cronológica e com numeração sequencial.",
    itens: [
      "Notas exibidas da mais antiga para a mais atual, considerando a data da nota.",
      "Numeração sequencial iniciada em 1 e recalculada automaticamente conforme novos registros.",
      "Lista sem cartões independentes, mantendo fornecedor, descrição e acesso ao documento fiscal.",
    ],
  },
  {
    versao: "1.0.7",
    data: "20/11/2026",
    titulo: "Notas de despesas dos adiantamentos",
    descricao: "Permite registrar notas fiscais e anexar os respectivos documentos aos processos de adiantamento.",
    itens: [
      "Ao abrir um processo de adiantamento, o usuário acessa a área de notas de despesas.",
      "Novo formulário com número da nota, data, fornecedor e descrição sucinta da despesa.",
      "Anexação opcional de nota fiscal em PDF ou imagem, com limite de 15 MB.",
      "Visualização dos registros e abertura segura dos documentos anexados.",
      "Inclusão dos registros de notas no backup administrativo do sistema.",
    ],
  },
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
