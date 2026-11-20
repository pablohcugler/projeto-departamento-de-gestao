import { PDFDocument, StandardFonts, rgb, type PDFEmbeddedPage, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import { brasaoMunicipio } from "@/lib/brasao";

export type AnexoRelatorio = {
  nome: string;
  mimeType: string;
  bytes: Uint8Array;
  categoria: "nota" | "complementar";
};

export type DadosRelatorioAdiantamento = {
  processo: {
    processo_1doc: string;
    numero_empenho: string;
    data_recebimento: string;
    periodo_aplicacao_dias: number;
    data_vencimento: string;
    valor_recebido: number | null;
  };
  nota: {
    numero_nota: string;
    data_nota: string;
    fornecedor: string;
    descricao: string;
    valor_despesa: number | null;
  };
  totalDespesas: number;
  anexos: AnexoRelatorio[];
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const BLUE = rgb(0.13, 0.31, 0.55);
const GREEN = rgb(0.20, 0.36, 0.18);
const DARK = rgb(0.10, 0.12, 0.15);
const MUTED = rgb(0.35, 0.40, 0.45);
const LIGHT = rgb(0.94, 0.96, 0.97);
const ADDRESS = "Rua Teodoro Ferreira Machado, s/n – Centro – CEP 11.950-000 – Cajati, SP";
const CONTACT = "E-mail: saude@cajati.sp.gov.br – Telefone: (13) 3854-8500";

function dataBR(value: string): string {
  if (!value) return "Não informado";
  const parts = value.split("-");
  return parts.length === 3 ? parts.reverse().join("/") : value;
}

function brl(value: number | null): string {
  if (value === null || !Number.isFinite(Number(value))) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = (text || "—").trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, maxWidth: number, font: PDFFont, size: number, color = DARK, lineHeight = size * 1.4): number {
  const lines = wrapText(text, font, size, maxWidth);
  lines.forEach((line, index) => page.drawText(line, { x, y: y - index * lineHeight, size, font, color }));
  return y - lines.length * lineHeight;
}

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.split(",")[1] ?? "");
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function drawShell(page: PDFPage, pageNumber: number, totalPages: number, crest: PDFImage, bold: PDFFont, regular: PDFFont, italic: PDFFont) {
  // Timbrado baseado no modelo institucional enviado: identificação da Saúde, brasão, faixas laterais e rodapé.
  page.drawText("Cajati", { x: 27, y: 800, size: 15, font: italic, color: DARK });
  page.drawText("SAÚDE", { x: 20, y: 766, size: 34, font: bold, color: rgb(0.0, 0.58, 0.34) });
  page.drawText("PREFEITURA DO MUNICÍPIO DE", { x: 185, y: 806, size: 13, font: bold, color: DARK });
  page.drawText("- ESTADO DE SÃO PAULO -", { x: 235, y: 787, size: 10, font: bold, color: DARK });
  page.drawText("SECRETARIA MUNICIPAL DE SAÚDE", { x: 205, y: 768, size: 11, font: bold, color: DARK });
  page.drawImage(crest, { x: 468, y: 754, width: 90, height: 66 });
  page.drawRectangle({ x: 18, y: 55, width: 7, height: 675, color: BLUE });
  page.drawRectangle({ x: 35, y: 55, width: 4, height: 675, color: GREEN });
  page.drawText(ADDRESS, { x: 72, y: 30, size: 7.5, font: regular, color: DARK });
  page.drawText(CONTACT, { x: 72, y: 18, size: 7.5, font: regular, color: DARK });
  const pageLabel = `Página ${pageNumber} de ${totalPages}`;
  page.drawText(pageLabel, { x: PAGE_W - 72 - regular.widthOfTextAtSize(pageLabel, 8), y: 24, size: 8, font: regular, color: DARK });
}

function drawField(page: PDFPage, label: string, value: string, x: number, y: number, bold: PDFFont, regular: PDFFont) {
  page.drawText(label.toLocaleUpperCase("pt-BR"), { x, y, size: 8, font: bold, color: MUTED });
  page.drawText(value || "—", { x, y: y - 17, size: 10, font: regular, color: DARK });
}

function addCoverPage(pdf: PDFDocument, data: DadosRelatorioAdiantamento, crest: PDFImage, bold: PDFFont, regular: PDFFont, italic: PDFFont, totalPages: number) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  drawShell(page, 1, totalPages, crest, bold, regular, italic);
  page.drawText("RELATÓRIO DE PRESTAÇÃO DE CONTAS", { x: 72, y: 718, size: 15, font: bold, color: BLUE });
  page.drawText(`ADIANTAMENTO Nº ${data.processo.processo_1doc}  •  REGISTRO INDIVIDUAL DE DESPESA`, { x: 72, y: 700, size: 8.5, font: bold, color: MUTED });

  // A primeira página reúne os dados administrativos do adiantamento e a identificação da despesa.
  page.drawRectangle({ x: 72, y: 560, width: 490, height: 120, color: LIGHT, borderColor: rgb(0.82, 0.86, 0.89), borderWidth: 0.8 });
  page.drawText("DADOS DO ADIANTAMENTO", { x: 86, y: 660, size: 10, font: bold, color: BLUE });
  drawField(page, "Processo de adiantamento", data.processo.processo_1doc, 86, 640, bold, regular);
  drawField(page, "Empenho", data.processo.numero_empenho, 330, 640, bold, regular);
  drawField(page, "Data do recebimento", dataBR(data.processo.data_recebimento), 86, 603, bold, regular);
  drawField(page, "Período de aplicação", `${data.processo.periodo_aplicacao_dias} dia(s)`, 245, 603, bold, regular);
  drawField(page, "Data do vencimento", dataBR(data.processo.data_vencimento), 390, 603, bold, regular);

  page.drawRectangle({ x: 72, y: 410, width: 490, height: 130, borderColor: rgb(0.82, 0.86, 0.89), borderWidth: 0.8 });
  page.drawText("IDENTIFICAÇÃO DA DESPESA", { x: 86, y: 520, size: 10, font: bold, color: BLUE });
  drawField(page, "Nota fiscal nº", data.nota.numero_nota, 86, 498, bold, regular);
  drawField(page, "Data da nota", dataBR(data.nota.data_nota), 245, 498, bold, regular);
  drawField(page, "Valor da despesa", brl(data.nota.valor_despesa), 405, 498, bold, regular);
  drawField(page, "Fornecedor / razão social", data.nota.fornecedor, 86, 458, bold, regular);

  page.drawRectangle({ x: 72, y: 255, width: 490, height: 135, borderColor: rgb(0.35, 0.35, 0.35), borderWidth: 0.8 });
  page.drawText("DESCRIÇÃO / JUSTIFICATIVA DA DESPESA", { x: 86, y: 370, size: 9, font: bold, color: DARK });
  drawWrapped(page, data.nota.descricao, 86, 348, 460, regular, 9, DARK, 13);

  page.drawRectangle({ x: 72, y: 135, width: 490, height: 98, color: LIGHT, borderColor: rgb(0.82, 0.86, 0.89), borderWidth: 0.8 });
  page.drawText("RESUMO FINANCEIRO DO ADIANTAMENTO", { x: 86, y: 214, size: 9, font: bold, color: BLUE });
  drawField(page, "Valor recebido", brl(data.processo.valor_recebido), 86, 192, bold, regular);
  drawField(page, "Total das despesas cadastradas", brl(data.totalDespesas), 245, 192, bold, regular);
  const saldo = data.processo.valor_recebido === null ? null : Number(data.processo.valor_recebido) - data.totalDespesas;
  drawField(page, "Saldo atual", brl(saldo), 445, 192, bold, regular);
  page.drawText("Documento emitido pelo sistema Gestão em Saúde – Prefeitura do Município de Cajati.", { x: 72, y: 112, size: 7.5, font: italic, color: MUTED });
}

type PaginaAnexo =
  | { kind: "pdf"; page: PDFEmbeddedPage }
  | { kind: "image"; image: PDFImage };

export async function gerarRelatorioAdiantamento(data: DadosRelatorioAdiantamento): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const crest = await pdf.embedPng(bytesFromDataUrl(brasaoMunicipio));

  const parsedAnnexes: Array<{ nome: string; categoria: "nota" | "complementar"; pages: PaginaAnexo[] }> = [];
  for (const anexo of data.anexos) {
    const mime = anexo.mimeType.toLowerCase();
    if (mime === "application/pdf" || anexo.nome.toLowerCase().endsWith(".pdf")) {
      const pages = await pdf.embedPdf(anexo.bytes);
      parsedAnnexes.push({ nome: anexo.nome, categoria: anexo.categoria, pages: pages.map((page) => ({ kind: "pdf", page })) });
    } else if (mime === "image/jpeg" || mime === "image/jpg" || /\.(jpe?g)$/i.test(anexo.nome)) {
      parsedAnnexes.push({ nome: anexo.nome, categoria: anexo.categoria, pages: [{ kind: "image", image: await pdf.embedJpg(anexo.bytes) }] });
    } else if (mime === "image/png" || /\.png$/i.test(anexo.nome)) {
      parsedAnnexes.push({ nome: anexo.nome, categoria: anexo.categoria, pages: [{ kind: "image", image: await pdf.embedPng(anexo.bytes) }] });
    } else {
      throw new Error(`O anexo "${anexo.nome}" não é PDF, JPG ou PNG. Converta-o para PDF para incluí-lo no relatório.`);
    }
  }

  const temNotaFiscal = parsedAnnexes.some((anexo) => anexo.categoria === "nota");
  const paginaNotaAusente = !temNotaFiscal ? 1 : 0;
  const totalPages = 1 + paginaNotaAusente + parsedAnnexes.reduce((sum, item) => sum + item.pages.length, 0);
  addCoverPage(pdf, data, crest, bold, regular, italic, totalPages);

  let pageNumber = 2;
  if (paginaNotaAusente) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    drawShell(page, pageNumber, totalPages, crest, bold, regular, italic);
    page.drawText("ANEXO – NOTA FISCAL", { x: 72, y: 718, size: 11, font: bold, color: BLUE });
    page.drawText("Não foi anexado arquivo de nota fiscal a este cadastro.", { x: 72, y: 680, size: 10, font: regular, color: MUTED });
    pageNumber += 1;
  }

  for (const anexo of parsedAnnexes) {
    for (const item of anexo.pages) {
      const page = pdf.addPage([PAGE_W, PAGE_H]);
      drawShell(page, pageNumber, totalPages, crest, bold, regular, italic);
      page.drawText(anexo.categoria === "nota" ? "ANEXO – NOTA FISCAL" : "ANEXO – DOCUMENTO COMPLEMENTAR", {
        x: 72, y: 718, size: 11, font: bold, color: BLUE,
      });
      page.drawText(anexo.nome, { x: 72, y: 701, size: 8, font: regular, color: MUTED, maxWidth: 485 });
      const content = item.kind === "pdf" ? item.page : item.image;
      const maxWidth = 480;
      const maxHeight = 620;
      const scale = Math.min(maxWidth / content.width, maxHeight / content.height);
      const width = content.width * scale;
      const height = content.height * scale;
      const options = { x: 78 + (maxWidth - width) / 2, y: 66 + (maxHeight - height) / 2, width, height };
      if (item.kind === "pdf") page.drawPage(item.page, options);
      else page.drawImage(item.image, options);
      pageNumber += 1;
    }
  }

  return pdf.save();
}
