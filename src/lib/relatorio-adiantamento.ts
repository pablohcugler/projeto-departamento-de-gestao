import { PDFDocument, StandardFonts, rgb, type PDFEmbeddedPage, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import { brasaoMunicipio } from "@/lib/brasao";
import { logoSaudeCajati } from "@/lib/logo-saude-cajati";

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
    justificativa: string;
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

async function drawShell(page: PDFPage, pageNumber: number, totalPages: number, crest: PDFImage, bold: PDFFont, regular: PDFFont, italic: PDFFont): Promise<void> {
  // Timbrado baseado no modelo institucional enviado: identificação da Saúde, brasão, faixas laterais e rodapé.
  const logoSaude = await page.doc.embedPng(bytesFromDataUrl(logoSaudeCajati));
  page.drawImage(logoSaude, { x: 22, y: 756, width: 150, height: 55 });
  // Mede o texto e reduz a fonte se necessário. Não usar maxWidth aqui:
  // o pdf-lib quebra a frase em outra linha e pode ocultar "CAJATI" sob a linha seguinte.
  const prefeituraTitulo = "PREFEITURA DO MUNICÍPIO DE CAJATI";
  const larguraCabecalho = 282;
  const tamanhoBase = 9.5;
  const larguraEmTamanhoBase = bold.widthOfTextAtSize(prefeituraTitulo, tamanhoBase);
  const tamanhoPrefeitura = larguraEmTamanhoBase > larguraCabecalho
    ? tamanhoBase * (larguraCabecalho / larguraEmTamanhoBase)
    : tamanhoBase;
  const larguraTitulo = bold.widthOfTextAtSize(prefeituraTitulo, tamanhoPrefeitura);
  page.drawText(prefeituraTitulo, {
    x: 180 + (larguraCabecalho - larguraTitulo) / 2,
    y: 806,
    size: tamanhoPrefeitura,
    font: bold,
    color: DARK,
  });
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

function drawJustifiedParagraph(page: PDFPage, text: string, x: number, y: number, maxWidth: number, font: PDFFont, size: number, color = DARK, lineHeight = size * 1.45) {
  const lines = wrapText(text, font, size, maxWidth);
  lines.forEach((line, index) => {
    const words = line.split(" ");
    const isLast = index === lines.length - 1;
    const naturalWidth = font.widthOfTextAtSize(line, size);
    const gap = !isLast && words.length > 1 ? (maxWidth - naturalWidth) / (words.length - 1) : 0;
    let cursorX = x;
    words.forEach((word, wordIndex) => {
      page.drawText(word, { x: cursorX, y: y - index * lineHeight, size, font, color });
      cursorX += font.widthOfTextAtSize(word, size) + (wordIndex < words.length - 1 ? font.widthOfTextAtSize(" ", size) + gap : 0);
    });
  });
}

async function addCoverPage(pdf: PDFDocument, data: DadosRelatorioAdiantamento, crest: PDFImage, bold: PDFFont, regular: PDFFont, italic: PDFFont, totalPages: number): Promise<void> {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  await drawShell(page, 1, totalPages, crest, bold, regular, italic);

  // O relatório individual apresenta somente os campos do modelo fornecido.
  // Metadados compactos e hierarquia visual mais próxima, conforme o modelo solicitado.
  page.drawText(`DIA: ${dataBR(data.nota.data_nota)}`, { x: 72, y: 700, size: 10.5, font: bold, color: DARK });
  page.drawText(`NF: ${data.nota.numero_nota || "Não informado"}`, { x: 72, y: 684, size: 10.5, font: bold, color: DARK });
  page.drawText(`RAZÃO SOCIAL: ${data.nota.fornecedor || "Não informado"}`, { x: 72, y: 668, size: 10.5, font: bold, color: DARK, maxWidth: 485 });

  const titulo = (data.nota.descricao || "DESCRIÇÃO DA DESPESA").trim();
  const justificativa = (data.nota.justificativa || "—").trim();

  page.drawText(titulo.toLocaleUpperCase("pt-BR"), { x: 72, y: 638, size: 11.5, font: bold, color: DARK, maxWidth: 485 });

  // Caixa dimensionada conforme o texto, evitando espaço vazio excessivo.
  const linhasJustificativa = wrapText(justificativa, bold, 9.5, 466);
  const alturaCaixa = Math.max(112, 43 + linhasJustificativa.length * 12.5);
  const topoCaixa = 615;
  const baseCaixa = Math.max(72, topoCaixa - alturaCaixa);
  page.drawRectangle({ x: 72, y: baseCaixa, width: 490, height: topoCaixa - baseCaixa, borderColor: DARK, borderWidth: 0.8 });
  page.drawText("Justificativa:", { x: 84, y: topoCaixa - 19, size: 9.5, font: bold, color: DARK });
  drawJustifiedParagraph(page, justificativa, 84, topoCaixa - 34, 466, bold, 9.5, DARK, 12.5);
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
  await addCoverPage(pdf, data, crest, bold, regular, italic, totalPages);

  let pageNumber = 2;
  if (paginaNotaAusente) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    await drawShell(page, pageNumber, totalPages, crest, bold, regular, italic);
    page.drawText("ANEXO – NOTA FISCAL", { x: 72, y: 718, size: 11, font: bold, color: BLUE });
    page.drawText("Não foi anexado arquivo de nota fiscal a este cadastro.", { x: 72, y: 680, size: 10, font: regular, color: MUTED });
    pageNumber += 1;
  }

  for (const anexo of parsedAnnexes) {
    for (const item of anexo.pages) {
      const page = pdf.addPage([PAGE_W, PAGE_H]);
      await drawShell(page, pageNumber, totalPages, crest, bold, regular, italic);
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
