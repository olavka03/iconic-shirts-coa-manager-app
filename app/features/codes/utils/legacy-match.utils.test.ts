import { describe, expect, it } from "vitest";
import type { TeamDictionary } from "~/features/codes/types/code-generator.types";
import { matchLegacyToItems } from "./legacy-match.utils";
import { testId } from "../../../../tests/helpers/test-ids.utils";

const DICTIONARY: TeamDictionary = {
  version: 1,
  prefix: "IS",
  groupTeams: {},
  signers: {},
  series: {},
  aliases: { psg: "paris saint germain" },
  teams: {
    arsenal: "A",
    "bayern munich": "BM",
    "borussia dortmund": "BD",
    barcelona: "B",
    liverpool: "L",
    "inter milan": "IM",
    "paris saint germain": "PSG",
  },
};
const legacyCertificate = (
  id: string,
  code: string,
  item: string,
  signer: string,
) => ({
  id,
  code,
  item,
  signerNames: [signer],
});

describe("matchLegacyToItems", () => {
  it("gives each #141638 certificate its own item", () => {
    const matches = matchLegacyToItems(
      [
        legacyCertificate(
          testId(1),
          "IS141638RLBD",
          "Borussia Dortmund Football Shirt - 2011-12 Home",
          "Robert Lewandowski",
        ),
        legacyCertificate(
          testId(2),
          "IS141638RLFB",
          "FC Barcelona Football Shirt - 2025-26 Away",
          "Robert Lewandowski",
        ),
        legacyCertificate(
          testId(3),
          "IS141638RLBM",
          "Bayern Munich Football Shirt - 2015-16 Home",
          "Robert Lewandowski",
        ),
      ],
      [
        {
          id: "li1",
          title:
            "Robert Lewandowski Signed Original Borussia Dortmund Football Shirt - 2011-12 Home",
        },
        {
          id: "li2",
          title:
            "Robert Lewandowski Signed FC Barcelona Football Shirt - 2025-26 Away",
        },
        {
          id: "li3",
          title:
            "Robert Lewandowski Signed Original Bayern Munich Football Shirt - 2015-16 Home",
        },
      ],
      DICTIONARY,
    );

    expect([...matches]).toEqual([
      [testId(1), "li1"],
      [testId(2), "li2"],
      [testId(3), "li3"],
    ]);
  });
  it("tells the same player and club apart by season (#141855)", () => {
    const matches = matchLegacyToItems(
      [
        legacyCertificate(
          testId(1),
          "IS141855DBA45",
          "Arsenal FC Original 2004–05 Away Shirt",
          "Dennis Bergkamp",
        ),
        legacyCertificate(
          testId(2),
          "IS141855DBA34",
          "Arsenal FC Original 2003–04 Away Shirt",
          "Dennis Bergkamp",
        ),
      ],
      [
        {
          id: "a",
          title:
            "Dennis Bergkamp Signed Arsenal FC Original 2004–05 Away Shirt",
        },
        {
          id: "b",
          title:
            "Dennis Bergkamp Signed Arsenal FC Original 2003–04 Away Shirt",
        },
      ],
      DICTIONARY,
    );

    expect([...matches]).toEqual([
      [testId(1), "a"],
      [testId(2), "b"],
    ]);
  });
  it("never guesses: a misspelt signer stays unmatched (#141524 IRL vs IRLP2)", () => {
    const matches = matchLegacyToItems(
      [
        legacyCertificate(
          testId(1),
          "IS141524IRL",
          "Liverpool Retro Home Shirt",
          "Ian Rusgh",
        ),
        legacyCertificate(
          testId(2),
          "IS141524IRLP2",
          "Liverpool Retro Home Shirt",
          "Ian Rush",
        ),
      ],
      [
        { id: "r", title: "Ian Rush Signed Liverpool Retro Home Shirt" },
        {
          id: "i",
          title: "Federico Dimarco Signed Inter Milan 2025–26 Home Shirt",
        },
      ],
      DICTIONARY,
    );

    expect([...matches]).toEqual([[testId(2), "r"]]);
  });
  it("leaves a certificate that fits two items unmatched and lets two certificates share one item", () => {
    const items = [
      { id: "x", title: "Ian Rush Signed Liverpool Retro Home Shirt" },
      { id: "y", title: "Ian Rush Signed Liverpool Retro Home Shirt" },
    ];

    expect(
      matchLegacyToItems(
        [
          legacyCertificate(
            testId(1),
            "A1",
            "Liverpool Retro Home Shirt",
            "Ian Rush",
          ),
        ],
        items,
        DICTIONARY,
      ).size,
    ).toBe(0);

    const one = [
      { id: "x", title: "Ian Rush Signed Liverpool Retro Home Shirt" },
    ];

    expect([
      ...matchLegacyToItems(
        [
          legacyCertificate(
            testId(1),
            "A1",
            "Liverpool Retro Home Shirt",
            "Ian Rush",
          ),
          legacyCertificate(
            testId(2),
            "A2",
            "Liverpool Retro Home Shirt",
            "Ian Rush",
          ),
        ],
        one,
        DICTIONARY,
      ),
    ]).toEqual([
      [testId(1), "x"],
      [testId(2), "x"],
    ]);
  });
  it("never matches an item without a team, and resolves aliases", () => {
    expect(
      matchLegacyToItems(
        [legacyCertificate(testId(1), "A1", "Football Boot", "Roberto Carlos")],
        [{ id: "b", title: "Roberto Carlos Signed Football Boot" }],
        DICTIONARY,
      ).size,
    ).toBe(0);
    expect([
      ...matchLegacyToItems(
        [
          legacyCertificate(
            testId(9),
            "A9",
            "Paris Saint-Germain Home Shirt 2025–26",
            "Désiré Doué",
          ),
        ],
        [{ id: "p", title: "Désiré Doué Signed PSG Home Shirt 2025–26" }],
        DICTIONARY,
      ),
    ]).toEqual([[testId(9), "p"]]);
  });
  it("matches items and signers named after Object.prototype members", () => {
    const names = ["Constructor", "__proto__", "toString", "hasOwnProperty"];
    const pairs = names.map((_unusedName, index) => [
      testId(index + 1),
      `li${index + 1}`,
    ]);
    const byItem = matchLegacyToItems(
      names.map((name, index) =>
        legacyCertificate(
          testId(index + 1),
          `A${index + 1}`,
          `${name} Home Shirt 2024-25`,
          "Phil Foden",
        ),
      ),
      names.map((name, index) => ({
        id: `li${index + 1}`,
        title: `Phil Foden Signed ${name} Home Shirt 2024-25`,
      })),
      DICTIONARY,
    );
    const bySigner = matchLegacyToItems(
      names.map((name, index) =>
        legacyCertificate(
          testId(index + 1),
          `A${index + 1}`,
          "Liverpool Retro Home Shirt",
          name,
        ),
      ),
      names.map((name, index) => ({
        id: `li${index + 1}`,
        title: `${name} Signed Liverpool Retro Home Shirt`,
      })),
      DICTIONARY,
    );

    expect([...byItem]).toEqual(pairs);
    expect([...bySigner]).toEqual(pairs);
  });
});
