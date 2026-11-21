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
  const pageCapacity = 10;
  const chunks: LinhaAnexoII[][] = [];
  for (let i = 0; i < data.despesas.length; i += pageCapacity) chunks.push(data.despesas.slice(i, i + pageCapacity));
  if (!chunks.length) chunks.push([]);
  const totalPages = chunks.length;
  let total = 0;
  data.despesas.forEach((d) => { total += d.valor_despesa; });

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex++) {
    const page = pdf.addPage([W, H]);
    await drawHeader(page, pageIndex + 1, totalPages, regular, bold);
    if (pageIndex === 0) {
      centered(page, "ANEXO II", 724, bold, 13);
      centered(page, "RELATÓRIO DE DESPESAS", 705, bold, 12);
      centered(page, "PRESTAÇÃO DE CONTAS DE ADIANTAMENTO", 688, bold, 10);
      centered(page, "SECRETARIA MUNICIPAL DE SAÚDE", 672, bold, 9);
      page.drawText(`EMPENHO Nº: ${data.numero_empenho}`, { x: 72, y: 635, size: 9, font: bold, color: DARK });
      page.drawText(`PROCESSO Nº: ${data.processo_1doc}`, { x: 72, y: 618, size: 9, font: bold, color: DARK });
      page.drawText(`RECEBIDO EM: ${dateBR(data.data_recebimento)}`, { x: 72, y: 601, size: 9, font: bold, color: DARK });
      page.drawText(`VENCIMENTO: ${dateBR(data.data_vencimento)}`, { x: 330, y: 601, size: 9, font: bold, color: DARK });
    } else {
      page.drawText("ANEXO II – RELATÓRIO DE DESPESAS (continuação)", { x: 72, y: 724, size: 10, font: bold, color: DARK });
      page.drawText(`PROCESSO Nº: ${data.processo_1doc}  |  EMPENHO Nº: ${data.numero_empenho}`, { x: 72, y: 706, size: 8.5, font: regular, color: DARK });
    }

    const columns = [
      { label: "Nº", width: 25 },
      { label: "DATA", width: 56 },
      { label: "Nº DOCUMENTO", width: 67 },
      { label: "FORNECEDOR", width: 126 },
      { label: "DISCRIMINAÇÃO", width: 125 },
      { label: "VALOR R$", width: 68 },
    ];
    const tableX = 72;
    const tableW = columns.reduce((sum, col) => sum + col.width, 0);
    let y = pageIndex === 0 ? 574 : 680;
    let x = tableX;
    const headerH = 32;
    page.drawRectangle({ x: tableX, y: y - headerH, width: tableW, height: headerH, color: rgb(0.89, 0.92, 0.94), borderColor: DARK, borderWidth: 0.6 });
    columns.forEach((col) => {
      const lines = col.label.split("\n");
      lines.forEach((line, i) => page.drawText(line, { x: x + 3, y: y - 13 - i * 9, size: 6.6, font: bold, color: DARK }));
      x += col.width;
    });
    y -= headerH;
    for (const item of chunks[pageIndex]) {
      const values = [String(item.numero), dateBR(item.data_nota), item.numero_nota, item.fornecedor, item.descricao, brl(item.valor_despesa)];
      const heights = values.map((v, i) => wrap(v, regular, 7, columns[i].width - 8).length * 9 + 8);
      const rowH = Math.max(27, ...heights);
      if (y - rowH < 95) break;
      x = tableX;
      page.drawRectangle({ x: tableX, y: y - rowH, width: tableW, height: rowH, borderColor: rgb(0.72, 0.76, 0.79), borderWidth: 0.35 });
      values.forEach((value, i) => {
        drawCellText(page, value, x, y, columns[i].width, regular, 7, 9);
        x += columns[i].width;
      });
      y -= rowH;
    }
    if (pageIndex === chunks.length - 1) {
      y -= 18;
      const summary = [
        ["VALOR DO ADIANTAMENTO RECEBIDO", brl(data.valor_recebido)],
        ["TOTAL DAS DESPESAS", brl(total)],
        ["SALDO A DEVOLVER", brl(Math.max(0, data.valor_recebido - total))],
      ];
      summary.forEach(([label, value]) => {
        page.drawText(label, { x: 72, y, size: 8, font: bold, color: DARK });
        page.drawText(value, { x: 390, y, size: 9, font: bold, color: DARK });
        y -= 18;
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
    comprovantePdfPages.forEach((embedded, index) => {
      const page = pdf.addPage([W, H]);
      await drawPageHeader(page, index + 2, totalPages);
      const scale = Math.min(490 / embedded.width, 660 / embedded.height);
      const width = embedded.width * scale;
      const height = embedded.height * scale;
      page.drawPage(embedded, { x: 72 + (490 - width) / 2, y: 80 + (660 - height) / 2, width, height });
    });
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
