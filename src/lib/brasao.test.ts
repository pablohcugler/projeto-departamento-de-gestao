import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { brasaoMunicipio } from "./brasao";

describe("Original municipal coat of arms", () => {
  it("embeds the exact uploaded PNG without an external asset request", () => {
    expect(brasaoMunicipio.startsWith("data:image/png;base64,")).toBe(true);
    const bytes = Buffer.from(brasaoMunicipio.split(",")[1] ?? "", "base64");
    expect(bytes.length).toBe(123452);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "f3a030f5ad409043dc17f6d63bbe27c223ba84f72d287ee26483e98223aa34f7",
    );
  });
});