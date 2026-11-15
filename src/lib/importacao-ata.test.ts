import { describe, expect, it } from "vitest";
import {
  extrairItensAtaTexto,
  numeroBR,
  reconstruirLinhasPdf,
} from "./importacao-ata";

describe("leitura do relatório de saldo da ata", () => {
  it("preserva códigos, fornecedor, unidade e valores brasileiros", () => {
    const texto = [
      "Fornecedor: 5400 - GILBERTO DOMINGUES MERCEARIA - ME",
      "Cd. Item   Cd. Produto   Descrição                         Unidade   Vl. Unitário   Qtd. Saldo   Vl. Total (Saldo)",
      "  0002   15.04458   ACENDEDOR DE SEGURANÇA, caixa com 40 palitos.       MÇ      3,7100       544,0000       2.018,24",
      "Valor Total do Fornecedor: 2.018,24",
    ].join("\n");
    expect(extrairItensAtaTexto(texto)).toEqual([
      {
        codigo_item: "0002",
        codigo_produto: "15.04458",
        descricao: "ACENDEDOR DE SEGURANÇA, caixa com 40 palitos.",
        fornecedor: "GILBERTO DOMINGUES MERCEARIA - ME",
        unidade: "MÇ",
        preco_unitario: 3.71,
        quantidade: 544,
        valor_total: 2018.24,
      },
    ]);
  });

  it("reconstrói as colunas a partir das coordenadas dos fragmentos PDF", () => {
    const linha = (y: number, itens: Array<[string, number, number]>) =>
      itens.map(([str, x, width]) => ({
        str, x, y, width, height: 8, fontSize: 8,
      }));

    const paginas = [[
      ...linha(100, [
        ["Fornecedor:", 20, 50], ["5400", 90, 18], ["-", 112, 3],
        ["GILBERTO", 120, 35], ["DOMINGUES", 158, 45],
        ["MERCEARIA", 207, 43], ["-", 253, 3], ["ME", 260, 11],
      ]),
      ...linha(90, [
        ["0002", 49, 18], ["15.04458", 87, 34],
        ["ACENDEDOR, TIPO FOSFORO de segurança,", 170, 180],
        ["MÇ", 540, 14], ["3,7100", 599, 28],
        ["544,0000", 685, 36], ["2.018,24", 756, 33],
      ]),
      ...linha(80, [["resistente, com ponta abrasiva e lixa externa.", 170, 180]]),
    ]];

    const texto = reconstruirLinhasPdf(paginas).join("\n");
    const itens = extrairItensAtaTexto(texto);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      codigo_item: "0002",
      codigo_produto: "15.04458",
      fornecedor: "GILBERTO DOMINGUES MERCEARIA - ME",
      unidade: "MÇ",
      preco_unitario: 3.71,
      quantidade: 544,
      valor_total: 2018.24,
    });
    expect(itens[0]?.descricao).toContain("resistente, com ponta abrasiva");
  });

  it("anexa linhas de continuação à descrição e troca o fornecedor no cabeçalho seguinte", () => {
    const texto = [
      "Fornecedor: 5400 - FORNECEDOR A LTDA",
      "  0002   15.04458   ITEM COM DESCRIÇÃO                         UND      2,5000       4,0000          10,00",
      "continuação da descrição na página seguinte",
      "Fornecedor: 5631 - FORNECEDOR B LTDA",
      "  0003   15.04459   OUTRO ITEM                                 CX       9,0000       2,0000          18,00",
      "CAJATI, 10 de Novembro de 2026.",
    ].join("\n");
    const itens = extrairItensAtaTexto(texto);
    expect(itens).toHaveLength(2);
    expect(itens[0]?.descricao).toContain("continuação da descrição");
    expect(itens[1]?.fornecedor).toBe("FORNECEDOR B LTDA");
  });

  it("converte números brasileiros", () => {
    expect(numeroBR("2.018,24")).toBe(2018.24);
    expect(numeroBR("544,0000")).toBe(544);
  });

  it("extrai a data do relatório no formato por extenso, inclusive com acento", () => {
    expect(extrairDataRelatorioTexto("CAJATI, 15 de Novembro de 2026.")).toBe("2026-11-15");
    expect(extrairDataRelatorioTexto("Cajati, 9 de março de 2026.")).toBe("2026-03-09");
  });

  it("extrai a data numérica da última página quando estiver em dd/mm/aaaa", () => {
    expect(extrairDataRelatorioTexto("Emitido em 15/11/2026")).toBe("2026-11-15");
  });

  it("não aceita datas impossíveis ou ausentes", () => {
    expect(extrairDataRelatorioTexto("Cajati, 32 de Novembro de 2026.")).toBeNull();
    expect(extrairDataRelatorioTexto("sem data no rodapé")).toBeNull();
  });

});
