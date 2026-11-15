import { describe, expect, it } from "vitest";
import { extrairStatusBllHtml, normalizarBll } from "./bll-status";

describe("consulta pública de status BLL", () => {
  it("normaliza números de edital sem depender de barras ou caixa", () => {
    expect(normalizarBll("PE096/2026CJ")).toBe("pe0962026cj");
  });

  it("localiza o edital de Cajati e extrai a coluna Situação", () => {
    const html = [
      "<table>",
      "<tr><th></th><th>Promotor</th><th>Número</th><th>Modalidade</th><th>Cidade</th><th>Situação</th><th>Publicação</th><th>Disputa</th></tr>",
      "<tr><td><button>i</button></td><td>MUNICIPIO DE CAJATI</td><td>PE096/2026CJ</td><td>PREGÃO ELETRÔNICO</td><td>CAJATI-SP</td><td>RECEPÇÃO DE PROPOSTAS</td><td>13/11/2026 09:24</td><td>01/12/2026 10:00</td></tr>",
      "<tr><td></td><td>MUNICIPIO DE OUTRA CIDADE</td><td>PE096/2026CJ</td><td>PREGÃO ELETRÔNICO</td><td>OUTRA-SP</td><td>HOMOLOGADO</td><td>13/11/2026</td><td>01/12/2026</td></tr>",
      "</table>",
    ].join("");
    const result = extrairStatusBllHtml(html, [
      { ataId: "ata-1", numeroEdital: "pe096/2026cj" },
    ]);
    expect(result).toEqual([
      {
        ataId: "ata-1",
        numeroEdital: "pe096/2026cj",
        fase: "RECEPÇÃO DE PROPOSTAS",
        localizado: true,
      },
    ]);
  });

  it("não atribui a um edital de Cajati o status de outro promotor", () => {
    const html = "<table><tr><td>MUNICIPIO DE OUTRA CIDADE</td><td>PE096/2026CJ</td><td>PREGÃO</td><td>OUTRA-SP</td><td>HOMOLOGADO</td></tr></table>";
    const result = extrairStatusBllHtml(html, [
      { ataId: "ata-2", numeroEdital: "PE096/2026CJ" },
    ]);
    expect(result[0]?.localizado).toBe(false);
    expect(result[0]?.fase).toBeNull();
  });

  it("retorna não localizado quando a página não contém o edital pesquisado", () => {
    const result = extrairStatusBllHtml("<table></table>", [
      { ataId: "ata-3", numeroEdital: "PE999/2026CJ" },
    ]);
    expect(result[0]?.mensagem).toContain("não localizado");
  });
});
