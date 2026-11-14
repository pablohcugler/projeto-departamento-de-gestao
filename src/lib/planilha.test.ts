import { describe, expect, it } from "vitest";
import { linhasParaItens, numeroBR } from "./planilha";

describe("importação por planilha", () => {
  it("entende valores no formato brasileiro", () => {
    expect(numeroBR("R$ 1.234,56")).toBe(1234.56);
  });
  it("reconhece colunas com nomes comuns", () => {
    const [i] = linhasParaItens([{ "Descrição": "Dipirona 500mg", Fornecedor: "Farma A", Unid: "CX", Qtde: "10", "Valor Unitário": "2,50" }]);
    expect(i).toEqual({ descricao: "Dipirona 500mg", fornecedor: "Farma A", unidade: "CX", quantidade: 10, preco_unitario: 2.5 });
  });
  it("ignora linhas sem descrição", () => {
    expect(linhasParaItens([{ "Descrição": "", Qtd: 3 }])).toHaveLength(0);
  });
});
