import { describe, expect, it } from "vitest";
import { extrairItensAtaTexto, numeroBR } from "./importacao-ata";

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
});
