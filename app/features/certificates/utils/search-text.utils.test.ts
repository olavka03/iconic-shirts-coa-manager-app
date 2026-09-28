import { describe, expect, it } from "vitest";
import { buildSearchText, foldText, searchTokens } from "./search-text.utils";

describe("foldText", () => {
  it.each([
    ["Sørloth", "sorloth"],
    ["Arda Güler", "arda guler"],
    ["Straße", "strasse"],
    ["Łukasz", "lukasz"],
    ["Æ", "ae"],
    ["Œuvre", "oeuvre"],
    ["ı", "i"],
    ["Đorđe", "dorde"],
  ])("%s → %s", (text, folded) => expect(foldText(text)).toBe(folded));
});

describe("searchTokens", () => {
  it("drops LIKE wildcards and backslashes, caps length and count", () => {
    expect(searchTokens("  Is141060-TKRM  %_\\ ")).toEqual([
      "is141060",
      "tkrm",
    ]);
    expect(searchTokens("a b c d e f g h i j")).toHaveLength(8);
    expect(searchTokens("x".repeat(150))).toEqual(["x".repeat(100)]);
  });
});

describe("buildSearchText", () => {
  const text = buildSearchText({
    code: "IS141060-TKRM",
    item: "Real Madrid Home Shirt",
    orderName: "#141909",
    signerNames: ["Arda Güler", "Alexander Sørloth"],
  });

  it("contains the code with and without hyphen, the order name and token, the item and folded signers", () => {
    const needles = [
      "is141060 tkrm",
      "is141060tkrm",
      "141909",
      "real madrid home shirt",
      "arda guler",
      "sorloth",
    ];

    for (const needle of needles) {
      expect(text).toContain(needle);
    }

    const tokens = [
      ...searchTokens("#141909"),
      ...searchTokens("is141060tkrm"),
      ...searchTokens("guler"),
    ];

    for (const token of tokens) {
      expect(text).toContain(token);
    }
  });

  it("matches 1001a for 1001-A", () => {
    const withLetters = buildSearchText({
      code: "ABCD",
      item: "",
      orderName: "1001-A",
      signerNames: [],
    });
    expect(withLetters).toContain("1001a");
  });

  it("leaves out locations and the line item title, even when the object carries them", () => {
    const certificate = {
      code: "IS141855DBA45",
      item: "Arsenal Home Shirt",
      orderName: "#141855",
      signerNames: ["Dennis Bergkamp"],
      location: "Amsterdam, Netherlands",
      lineItemTitle: "Dennis Bergkamp Signed Arsenal FC Original Away Shirt",
    };
    const text = buildSearchText(certificate);

    expect(text).toContain("dennis bergkamp");
    expect(text).not.toContain("amsterdam");
    expect(text).not.toContain("netherlands");
    expect(text).not.toContain("original");
    expect(text).not.toContain("away");
  });
});
