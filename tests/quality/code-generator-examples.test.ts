import { describe, expect, it } from "vitest";
import type { CodeSuggestion } from "~/features/codes/types/code-generator.types";
import {
  resolveCollision,
  suggestCode,
  withSeriesHint,
} from "~/features/codes/utils/code-suggestion.utils";
import { parseProductTitle } from "~/features/codes/utils/product-title.utils";
import { isKnownTeam } from "~/features/codes/utils/team-names.utils";
import { devStoreOrders, LINE_ITEM_IDS } from "../fakes/orders.fake";
import {
  legacyDictionary,
  legacyHistory,
} from "../helpers/legacy-history.fixture";

const HISTORY = legacyHistory();
const DICTIONARY = legacyDictionary(HISTORY);
const DEV_STORE_LINES = new Map(
  devStoreOrders().flatMap((order) =>
    order.lineItems.map(
      (line) =>
        [line.id, { orderName: order.name, title: line.title }] as const,
    ),
  ),
);

function legacyCertificate(code: string) {
  const found = HISTORY.find((certificate) => certificate.code === code);

  if (found === undefined) {
    throw new Error(`${code} is not in the legacy history`);
  }

  return found;
}

function suggestForDevStoreLine(lineItemId: string) {
  const line = DEV_STORE_LINES.get(lineItemId);

  if (line === undefined) {
    throw new Error(`${lineItemId} is not a dev-store line item`);
  }

  const parsed = parseProductTitle(line.title, {
    isTeam: (name) => isKnownTeam(name, DICTIONARY),
  });
  const suggestion = suggestCode(
    {
      orderName: line.orderName,
      signerNames: parsed.signers,
      item: parsed.item,
    },
    DICTIONARY,
  );

  if (suggestion === null) {
    throw new Error(`${line.orderName} gets no suggestion`);
  }

  return { signers: parsed.signers, suggestion };
}

describe("dictionary learned from the 371 legacy certificates", () => {
  it("has the measured shape and stays under 17 KB", () => {
    expect(DICTIONARY.prefix).toBe("IS");
    expect(Object.keys(DICTIONARY.teams)).toHaveLength(39);
    expect(Object.keys(DICTIONARY.groupTeams)).toHaveLength(7);
    expect(DICTIONARY.aliases).toEqual({ psg: "paris saint germain" });
    expect(Object.keys(DICTIONARY.series)).toHaveLength(227);
    expect(JSON.stringify(DICTIONARY).length).toBeLessThan(17_000);
    expect(DICTIONARY.teams.galatasary).toBe("R");
  });
});

describe("worked examples (spec §4.3.1)", () => {
  it.each<
    [
      orderName: string,
      signerNames: string[],
      item: string,
      code: string,
      source: CodeSuggestion["source"],
      confidence: CodeSuggestion["confidence"],
    ]
  >([
    [
      "#141638",
      ["Robert Lewandowski"],
      "Bayern Munich Football Shirt - 2015-16 Home",
      "IS141638RLBM1516",
      "series",
      "high",
    ],
    [
      "#141950",
      ["Robert Lewandowski"],
      "Original Bayern Munich Football Shirt - 2015-16 Home",
      "IS141950RLBM1516",
      "composed",
      "medium",
    ],
    [
      "#141950",
      ["Kaká"],
      "Brazil 2004-2006 Home Shirt",
      "IS141950KB0406",
      "series",
      "high",
    ],
    [
      "#141950",
      ["Marco van Basten"],
      "AC Milan Home Shirt - 1988 Retro",
      "IS141950MBAM88",
      "series",
      "high",
    ],
    [
      "#141950",
      ["Rafael Leão"],
      "AC Milan Home Shirt 2025-26",
      "IS141950RLACM2526",
      "composed",
      "medium",
    ],
    [
      "#141950",
      ["Virgil van Dijk"],
      "Netherlands Home Shirt 2026",
      "IS141950VDNL26",
      "composed",
      "medium",
    ],
    [
      "#141950",
      ["Erling Haaland"],
      "Norway Home Shirt 2026",
      "IS141950EHN26",
      "composed",
      "low",
    ],
    [
      "#141950",
      ["Thierry Henry", "Dennis Bergkamp"],
      "Arsenal Home Shirt",
      "IS141950THDBA",
      "series",
      "high",
    ],
    [
      "#141950",
      ["Pedri", "Gavi", "Lamine Yamal"],
      "FC Barcelona Home Shirt 2026–27",
      "IS141950B2627",
      "composed",
      "low",
    ],
    [
      "#EN1001",
      ["Désiré Doué"],
      "Paris Saint-Germain 2025–26 Home Shirt",
      "IS1001DDP2526",
      "series",
      "high",
    ],
  ])(
    "%s · %j · %s → %s",
    (orderName, signerNames, item, code, source, confidence) => {
      expect(
        suggestCode({ orderName, signerNames, item }, DICTIONARY),
      ).toMatchObject({ code, source, confidence });
    },
  );

  it("a duplicate of IS141816PMM for #141950 keeps its letters and adds the season it lacked", () => {
    const original = legacyCertificate("IS141816PMM");

    expect(
      suggestCode(
        {
          orderName: "#141950",
          signerNames: original.signerNames,
          item: original.item,
        },
        withSeriesHint(DICTIONARY, original),
      ),
    ).toMatchObject({
      code: "IS141950PMM94",
      source: "series",
      confidence: "high",
    });
  });
});

describe("dev-store orders, codes from the line item titles (spec §6.4.1, §12.7 item 10)", () => {
  it.each([
    ["bayern", "IS141002RLBM1516"],
    ["dortmund", "IS141002RLBD1112"],
    ["arsenal0405", "IS141003DBA45"],
    ["arsenal0304", "IS141003DBA34"],
    ["guler", "IS141004AGRM2627"],
    ["scholesGiggs", "IS141005PSRG9800"],
    ["sneijder", "IS141005WSR1314"],
    ["vanBasten", "IS141005MBNL88"],
  ] as const)("%s → %s", (line, code) => {
    expect(suggestForDevStoreLine(LINE_ITEM_IDS[line]).suggestion.code).toBe(
      code,
    );
  });

  it("reads both signers of the Scholes and Giggs shirt from its title", () => {
    expect(suggestForDevStoreLine(LINE_ITEM_IDS.scholesGiggs).signers).toEqual([
      "Paul Scholes",
      "Ryan Giggs",
    ]);
  });

  it("gives the second Güler shirt on the order the -2 code", () => {
    const { suggestion } = suggestForDevStoreLine(LINE_ITEM_IDS.guler);

    expect(
      resolveCollision(
        suggestion.code,
        new Set([suggestion.code]),
        suggestion.parts.season,
      ),
    ).toBe("IS141004AGRM2627-2");
  });
});
