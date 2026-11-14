import { describe, expect, it } from "vitest";
import { diasParaVencer, statusAta } from "./vencimento";

const hoje = new Date(2026, 10, 14); // 14/11/2026

describe("vencimento das atas", () => {
  it("conta os dias até o vencimento", () => {
    expect(diasParaVencer("2026-11-24", hoje)).toBe(10);
  });
  it("ata com vencimento passado está vencida", () => {
    expect(statusAta("2026-11-13", 90, hoje)).toBe("vencida");
  });
  it("ata dentro da janela de alerta gera alerta", () => {
    expect(statusAta("2027-01-10", 90, hoje)).toBe("alerta");
  });
  it("vence hoje ainda é alerta, não vencida", () => {
    expect(statusAta("2026-11-14", 90, hoje)).toBe("alerta");
  });
  it("ata fora da janela está vigente", () => {
    expect(statusAta("2027-06-01", 90, hoje)).toBe("vigente");
  });
});
