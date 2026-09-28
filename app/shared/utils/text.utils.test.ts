import { describe, expect, it } from "vitest";
import { cleanText } from "./text.utils";

describe("cleanText", () => {
  it("turns no-break spaces into spaces, collapses and trims", () => {
    expect(cleanText(" Thierry  Henry \n")).toBe("Thierry Henry");
    expect(cleanText(42)).toBe("");
  });
});
