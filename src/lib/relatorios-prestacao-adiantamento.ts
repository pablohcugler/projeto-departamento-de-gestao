import { PDFDocument, StandardFonts, rgb, type PDFEmbeddedPage, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import { brasaoMunicipio } from "@/lib/brasao";
import { logoSaudeCajati } from "@/lib/logo-saude-cajati";

export type LinhaAnexoII = {
  numero: number;
  numero_nota: string;
  data_nota: string;
  fornecedor: string;
  descricao: string;
  valor_despesa: number;
};

export type DadosAnexoII = {
  processo_1doc: string;
  numero_empenho: string;
  data_recebimento: string;
  data_vencimento: string;
  valor_recebido: number;
  despesas: LinhaAnexoII[];
};

export type DadosDepositoSaldo = {
  processo_1doc: string;
  numero_empenho: string;
  data_devolucao: string;
  valor_devolvido: number;
};

export type ComprovanteDevolucao = {
  nome: string;
  mimeType: string;
  bytes: Uint8Array;
};

const W = 595.28;
const H = 841.89;
const BLUE = rgb(0.13, 0.31, 0.55);
const GREEN = rgb(0.20, 0.36, 0.18);
const DARK = rgb(0.10, 0.12, 0.15);
const MUTED = rgb(0.35, 0.40, 0.45);
const ADDRESS = "Rua Teodoro Ferreira Machado, s/n – Centro – CEP 11.950-000 – Cajati, SP";
const CONTACT = "E-mail: saude@cajati.sp.gov.br – Telefone: (13) 3854-8500";

function bytesFromDataUrl(value: string): Uint8Array {
  const binary = atob(value.split(",")[1] ?? "");
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function brl(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
function dateBR(value: string): string {
  if (!value) return "—";
  const parts = value.split("-");
  return parts.length === 3 ? parts.reverse().join("/") : value;
}
function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const words = (text || "—").trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (!line || font.widthOfTextAtSize(next, size) <= max) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}
function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, x = 170, width = 255) {
  const measured = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x + (width - measured) / 2, y, font, size, color: DARK });
}
async function drawHeader(page: PDFPage, pageNo: number, total: number, regular: PDFFont, bold: PDFFont) {
  const logo = await page.doc.embedPng(bytesFromDataUrl(logoSaudeCajati));
  const crest = await page.doc.embedPng(bytesFromDataUrl(brasaoMunicipio));
  page.drawImage(logo, { x: 10, y: 756, width: 164, height: 55 });
  centered(page, "PREFEITURA DO MUNICÍPIO DE CAJATI", 806, bold, 10.5, 176, 242);
  centered(page, "- ESTADO DE SÃO PAULO -", 787, bold, 9.5, 176, 242);
  centered(page, "SECRETARIA MUNICIPAL DE SAÚDE", 768, bold, 10, 176, 242);
  page.drawImage(crest, { x: 450, y: 754, width: 90, height: 66 });
  page.drawRectangle({ x: 18, y: 0, width: 7, height: 710, color: BLUE });
  page.drawRectangle({ x: 35, y: 0, width: 4, height: 580, color: GREEN });
  page.drawText(ADDRESS, { x: 70, y: 35, size: 7.2, font: regular, color: DARK });
  page.drawText(CONTACT, { x: 70, y: 23, size: 7.2, font: regular, color: DARK });
  const label = `Página ${pageNo} de ${total}`;
  page.drawText(label, { x: W - 72 - regular.widthOfTextAtSize(label, 7.5), y: 23, size: 7.5, font: regular, color: DARK });
}
function drawCellText(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, size: number, lineHeight: number) {
  const lines = wrap(text, font, size, width - 8);
  lines.forEach((line, i) => page.drawText(line, { x: x + 4, y: y - 12 - i * lineHeight, size, font, color: DARK }));
  return Math.max(25, lines.length * lineHeight + 8);
}

export async function gerarAnexoIIDespesas(data: DadosAnexoII): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Larguras e títulos alinhados ao modelo Excel oficial do ANEXO II.
  const columns = [
    { label: "Nº", width: 30, align: "center" as const },
    { label: "DATA DA\nEMISSÃO", width: 68, align: "center" as const },
    { label: "ESPECIFICAÇÃO /\nDOCUMENTO", width: 84, align: "center" as const },
    { label: "FORNECEDOR", width: 112, align: "left" as const },
    { label: "DISCRIMINAÇÃO\nDA DESPESA", width: 112, align: "left" as const },
    { label: "VALOR (R$)", width: 70, align: "right" as const },
  ];
  const tableX = 72;
  const tableW = columns.reduce((sum, col) => sum + col.width, 0);
  const headerH = 42;
  const rowFontSize = 8;
  const rowLineHeight = 10.5;
  const rowPadding = 14;
  const summaryReserve = 128;
  const headerColor = rgb(0.12, 0.27, 0.43);
  const gridColor = rgb(0.75, 0.80, 0.85);
  const alternateFill = rgb(0.96, 0.975, 0.985);

  const valoresLinha = (item: LinhaAnexoII) => [
    String(item.numero),
    dateBR(item.data_nota),
    String(item.numero_nota ?? ""),
    item.fornecedor,
    item.descricao,
    brl(item.valor_despesa),
  ];

  const alturaLinha = (item: LinhaAnexoII) => {
    const values = valoresLinha(item);
    const maxLines = Math.max(...values.map((value, index) =>
      wrap(value, regular, rowFontSize, (columns[index]?.width ?? 0) - 12).length
    ));
    return Math.max(36, maxLines * rowLineHeight + rowPadding);
  };

  // Paginação por altura real do conteúdo: evita cortar ou omitir despesas longas.
  const chunks: LinhaAnexoII[][] = [];
  let chunkAtual: LinhaAnexoII[] = [];
  let alturaAtual = 0;
  for (const despesa of data.despesas) {
    const topTabela = chunks.length === 0 ? 574 : 680;
    const alturaDisponivel = topTabela - headerH - 95 - summaryReserve;
    const altura = alturaLinha(despesa);
    if (chunkAtual.length > 0 && alturaAtual + altura > alturaDisponivel) {
      chunks.push(chunkAtual);
      chunkAtual = [];
      alturaAtual = 0;
    }
    chunkAtual.push(despesa);
    alturaAtual += altura;
  }
  if (chunkAtual.length > 0) chunks.push(chunkAtual);
  if (!chunks.length) chunks.push([]);

  const totalPages = chunks.length;
  const total = data.despesas.reduce((sum, despesa) => sum + (Number(despesa.valor_despesa) || 0), 0);

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex++) {
    const page = pdf.addPage([W, H]);
    await drawHeader(page, pageIndex + 1, totalPages, regular, bold);

    if (pageIndex === 0) {
      centered(page, "ANEXO II", 724, bold, 13);
      centered(page, "RELATÓRIO DE DESPESAS", 705, bold, 12);
      centered(page, "PRESTAÇÃO DE CONTAS DE ADIANTAMENTO", 688, bold, 10);
      centered(page, "SECRETARIA MUNICIPAL DE SAÚDE", 672, bold, 9);
      page.drawText("EMPENHO Nº: " + data.numero_empenho, { x: 72, y: 635, size: 9, font: bold, color: DARK });
      page.drawText("PROCESSO Nº: " + data.processo_1doc, { x: 72, y: 618, size: 9, font: bold, color: DARK });
      page.drawText("RECEBIDO EM: " + dateBR(data.data_recebimento), { x: 72, y: 601, size: 9, font: bold, color: DARK });
      const vencimento = "VENCIMENTO: " + dateBR(data.data_vencimento);
      page.drawText(vencimento, {
        x: tableX + tableW - bold.widthOfTextAtSize(vencimento, 9),
        y: 601,
        size: 9,
        font: bold,
        color: DARK,
      });
    } else {
      page.drawText("ANEXO II - RELATÓRIO DE DESPESAS (continuação)", { x: 72, y: 724, size: 10, font: bold, color: DARK });
      page.drawText("PROCESSO Nº: " + data.processo_1doc + "  |  EMPENHO Nº: " + data.numero_empenho, {
        x: 72, y: 706, size: 8.5, font: regular, color: DARK,
      });
    }

    let y = pageIndex === 0 ? 574 : 680;
    const headerBottom = y - headerH;
    page.drawRectangle({
      x: tableX,
      y: headerBottom,
      width: tableW,
      height: headerH,
      color: headerColor,
      borderColor: headerColor,
      borderWidth: 0.8,
    });

    let headerX = tableX;
    columns.forEach((column) => {
      const lines = column.label.split("\n");
      const lineHeight = 10;
      const blockHeight = lines.length * lineHeight;
      let baseline = y - (headerH - blockHeight) / 2 - 7.2;
      lines.forEach((line) => {
        const textWidth = bold.widthOfTextAtSize(line, 7.2);
        page.drawText(line, {
          x: headerX + (column.width - textWidth) / 2,
          y: baseline,
          size: 7.2,
          font: bold,
          color: rgb(1, 1, 1),
        });
        baseline -= lineHeight;
      });
      headerX += column.width;
    });

    // Divisórias verticais do cabeçalho.
    let boundaryX = tableX;
    for (let index = 0; index < columns.length - 1; index++) {
      boundaryX += columns[index]!.width;
      page.drawLine({
        start: { x: boundaryX, y },
        end: { x: boundaryX, y: headerBottom },
        thickness: 0.65,
        color: rgb(0.72, 0.79, 0.86),
      });
    }

    y = headerBottom;
    const linhas = chunks[pageIndex] ?? [];
    for (let rowIndex = 0; rowIndex < linhas.length; rowIndex++) {
      const item = linhas[rowIndex]!;
      const values = valoresLinha(item);
      const rowH = alturaLinha(item);
      const rowBottom = y - rowH;
      if (rowBottom < 95) {
        throw new Error("O ANEXO II excedeu a área útil da página. Reduza a extensão de uma descrição ou fornecedor.");
      }

      page.drawRectangle({
        x: tableX,
        y: rowBottom,
        width: tableW,
        height: rowH,
        color: rowIndex % 2 === 0 ? rgb(1, 1, 1) : alternateFill,
        borderColor: gridColor,
        borderWidth: 0.55,
      });

      let cellX = tableX;
      values.forEach((value, columnIndex) => {
        const column = columns[columnIndex]!;
        const lines = wrap(value, regular, rowFontSize, column.width - 12);
        const blockHeight = lines.length * rowLineHeight;
        let baseline = y - (rowH - blockHeight) / 2 - rowFontSize;
        lines.forEach((line) => {
          const textWidth = regular.widthOfTextAtSize(line, rowFontSize);
          let textX = cellX + 6;
          if (column.align === "center") {
            textX = cellX + (column.width - textWidth) / 2;
          } else if (column.align === "right") {
            textX = cellX + column.width - 7 - textWidth;
          }
          page.drawText(line, {
            x: textX,
            y: baseline,
            size: rowFontSize,
            font: regular,
            color: DARK,
          });
          baseline -= rowLineHeight;
        });
        cellX += column.width;
      });

      // Divisórias internas para leitura por coluna, mantendo a tabela leve.
      boundaryX = tableX;
      for (let index = 0; index < columns.length - 1; index++) {
        boundaryX += columns[index]!.width;
        page.drawLine({
          start: { x: boundaryX, y },
          end: { x: boundaryX, y: rowBottom },
          thickness: 0.4,
          color: gridColor,
        });
      }
      y = rowBottom;
    }

    // Total das despesas integrado à tabela, com a coluna de valor alinhada à direita.
    const totalRowH = 28;
    const totalBottom = y - totalRowH;
    if (pageIndex === chunks.length - 1) {
      page.drawRectangle({
        x: tableX,
        y: totalBottom,
        width: tableW,
        height: totalRowH,
        color: rgb(0.91, 0.94, 0.97),
        borderColor: gridColor,
        borderWidth: 0.65,
      });
      const label = "TOTAL DAS DESPESAS";
      const labelWidth = bold.widthOfTextAtSize(label, 8.5);
      page.drawText(label, {
        x: tableX + tableW - columns[5]!.width - 12 - labelWidth,
        y: totalBottom + 9,
        size: 8.5,
        font: bold,
        color: DARK,
      });
      const totalText = brl(total);
      page.drawText(totalText, {
        x: tableX + tableW - 7 - bold.widthOfTextAtSize(totalText, 8.5),
        y: totalBottom + 9,
        size: 8.5,
        font: bold,
        color: DARK,
      });
      const amountBoundary = tableX + tableW - columns[5]!.width;
      page.drawLine({
        start: { x: amountBoundary, y },
        end: { x: amountBoundary, y: totalBottom },
        thickness: 0.55,
        color: gridColor,
      });
      y = totalBottom - 14;

      // Quadro-resumo alinhado e com cores discretas, seguindo o Excel de referência.
      const devolucao = Math.max(0, Math.round((data.valor_recebido - total) * 100) / 100);
      const complementacao = Math.max(0, Math.round((total - data.valor_recebido) * 100) / 100);
      const summaryRows = [
        { label: "VALOR DA DESPESA EXCEDENTE", value: brl(total), fill: rgb(0.98, 0.93, 0.90) },
        { label: "VALOR DO ADIANTAMENTO RECEBIDO", value: brl(data.valor_recebido), fill: rgb(0.91, 0.96, 0.89) },
        { label: "VALOR DE REEMBOLSO / SALDO A DEVOLVER", value: brl(devolucao), fill: rgb(0.90, 0.94, 0.98) },
        { label: "COMPLEMENTAÇÃO", value: complementacao > 0 ? brl(complementacao) : "-", fill: rgb(0.99, 0.97, 0.89) },
      ];
      const summaryH = 20;
      summaryRows.forEach((row) => {
        page.drawRectangle({
          x: tableX,
          y: y - summaryH,
          width: tableW,
          height: summaryH,
          color: row.fill,
          borderColor: gridColor,
          borderWidth: 0.45,
        });
        page.drawText(row.label, {
          x: tableX + 8,
          y: y - 13.2,
          size: 7.8,
          font: bold,
          color: DARK,
        });
        const valueWidth = bold.widthOfTextAtSize(row.value, 8.2);
        page.drawText(row.value, {
          x: tableX + tableW - 9 - valueWidth,
          y: y - 13.2,
          size: 8.2,
          font: bold,
          color: DARK,
        });
        y -= summaryH;
      });
    }
  }

  pdf.setTitle("ANEXO II - RELATÓRIO DE DESPESAS");
  return pdf.save();
}

export async function gerarDepositoSaldoRemanescente(
  data: DadosDepositoSaldo,
  comprovante: ComprovanteDevolucao,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const crest = await pdf.embedPng(bytesFromDataUrl(brasaoMunicipio));
  const logo = await pdf.embedPng(bytesFromDataUrl(logoSaudeCajati));

  const drawPageHeader = async (page: PDFPage, no: number, total: number) => {
    page.drawImage(logo, { x: 10, y: 756, width: 164, height: 55 });
    centered(page, "PREFEITURA DO MUNICÍPIO DE CAJATI", 806, bold, 10.5, 176, 242);
    centered(page, "- ESTADO DE SÃO PAULO -", 787, bold, 9.5, 176, 242);
    centered(page, "SECRETARIA MUNICIPAL DE SAÚDE", 768, bold, 10, 176, 242);
    page.drawImage(crest, { x: 450, y: 754, width: 90, height: 66 });
    page.drawRectangle({ x: 18, y: 0, width: 7, height: 710, color: BLUE });
    page.drawRectangle({ x: 35, y: 0, width: 4, height: 580, color: GREEN });
    page.drawText(ADDRESS, { x: 70, y: 35, size: 7.2, font: regular, color: DARK });
    page.drawText(CONTACT, { x: 70, y: 23, size: 7.2, font: regular, color: DARK });
    const label = `Página ${no} de ${total}`;
    page.drawText(label, { x: W - 72 - regular.widthOfTextAtSize(label, 7.5), y: 23, size: 7.5, font: regular, color: DARK });
  };

  const comprovanteMime = comprovante.mimeType.toLowerCase();
  let comprovantePdfPages: PDFEmbeddedPage[] = [];
  let comprovanteImage: PDFImage | null = null;
  if (comprovanteMime === "application/pdf" || comprovante.nome.toLowerCase().endsWith(".pdf")) {
    comprovantePdfPages = await pdf.embedPdf(comprovante.bytes);
  } else if (comprovanteMime.includes("png") || comprovante.nome.toLowerCase().endsWith(".png")) {
    comprovanteImage = await pdf.embedPng(comprovante.bytes);
  } else if (comprovanteMime.includes("jpeg") || comprovanteMime.includes("jpg") || /\.jpe?g$/i.test(comprovante.nome)) {
    comprovanteImage = await pdf.embedJpg(comprovante.bytes);
  } else {
    throw new Error("O comprovante deve ser PDF, JPG ou PNG.");
  }

  const totalPages = 1 + Math.max(1, comprovantePdfPages.length);
  const first = pdf.addPage([W, H]);
  await drawPageHeader(first, 1, totalPages);
  centered(first, "DEPÓSITO DE SALDO REMANESCENTE", 720, bold, 13, 70, 470);
  first.drawText(`PROCESSO DE ADIANTAMENTO: ${data.processo_1doc}`, { x: 72, y: 670, size: 10, font: bold, color: DARK });
  first.drawText(`EMPENHO Nº: ${data.numero_empenho}`, { x: 72, y: 648, size: 10, font: bold, color: DARK });
  first.drawText(`DATA DA DEVOLUÇÃO: ${dateBR(data.data_devolucao)}`, { x: 72, y: 626, size: 10, font: bold, color: DARK });
  first.drawText(`VALOR DEVOLVIDO: ${brl(data.valor_devolvido)}`, { x: 72, y: 604, size: 12, font: bold, color: BLUE });
  first.drawText("DADOS BANCÁRIOS PARA DEVOLUÇÃO", { x: 72, y: 548, size: 10, font: bold, color: DARK });
  first.drawText("Banco do Brasil", { x: 72, y: 524, size: 10, font: regular, color: DARK });
  first.drawText("Titular: Fundo Municipal de Saúde", { x: 72, y: 505, size: 10, font: regular, color: DARK });
  first.drawText("Agência: 4671-0", { x: 72, y: 486, size: 10, font: regular, color: DARK });
  first.drawText("Conta corrente: 9803-5", { x: 72, y: 467, size: 10, font: regular, color: DARK });
  first.drawText("Comprovante de transferência anexado na página seguinte.", { x: 72, y: 420, size: 9, font: regular, color: MUTED });

  if (comprovantePdfPages.length) {
    for (const [index, embedded] of comprovantePdfPages.entries()) {
      const page = pdf.addPage([W, H]);
      await drawPageHeader(page, index + 2, totalPages);
      const scale = Math.min(490 / embedded.width, 660 / embedded.height);
      const width = embedded.width * scale;
      const height = embedded.height * scale;
      page.drawPage(embedded, { x: 72 + (490 - width) / 2, y: 80 + (660 - height) / 2, width, height });
    }
  } else if (comprovanteImage) {
    const page = pdf.addPage([W, H]);
    await drawPageHeader(page, 2, totalPages);
    const scale = Math.min(490 / comprovanteImage.width, 660 / comprovanteImage.height);
    const width = comprovanteImage.width * scale;
    const height = comprovanteImage.height * scale;
    page.drawImage(comprovanteImage, { x: 72 + (490 - width) / 2, y: 80 + (660 - height) / 2, width, height });
  }
  pdf.setTitle("DEPÓSITO DE SALDO REMANESCENTE");
  return pdf.save();
}
