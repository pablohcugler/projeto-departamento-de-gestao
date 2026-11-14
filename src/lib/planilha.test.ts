import { describe, expect, it } from "vitest";
import { linhasParaItens, numeroBR } from "./planilha";

describe("importação por planilha", () => {
  it("entende valores no formato brasileiro", () => {
    expect(numeroBR("R$ 1.234,56")).toBe(1234.56);
  });
  it("reconhece colunas com nomes comuns e calcula o total", () => {
    const [i] = linhasParaItens([{ "Descrição": "Dipirona 500mg", Fornecedor: "Farma A", Unid: "CX", Qtde: "10", "Valor Unitário": "2,50" }]);
    expect(i).toEqual({
      codigo_item: "",
      codigo_produto: "",
      descricao: "Dipirona 500mg",
      fornecedor: "Farma A",
      unidade: "CX",
      quantidade: 10,
      preco_unitario: 2.5,
      valor_total: 25,
    });
  });
  it("reconhece códigos e total em colunas", () => {
    const [i] = linhasParaItens([{ "Cd. Item": "0002", "Cd. Produto": "15.04458", Descrição: "Acendedor", Fornecedor: "Empresa A", Unidade: "MÇ", "Qtd. Saldo": "544,0000", "Vl. Unitário": "3,7100", "Vl. Total (Saldo)": "2.018,24" }]);
    expect(i?.codigo_item).toBe("0002");
    expect(i?.codigo_produto).toBe("15.04458");
    expect(i?.valor_total).toBe(2018.24);
  });
  it("ignora linhas sem descrição", () => {
    expect(linhasParaItens([{ "Descrição": "", Qtd: 3 }])).toHaveLength(0);
  });
});
