import { describe, expect, it } from "vitest";
import type {
  CodeHistoryItem,
  TeamDictionary,
} from "~/features/codes/types/code-generator.types";
import { segmentSuffix } from "./code-segments.utils";
import {
  resolveCollision,
  retargetCode,
  suggestCode,
  withSeriesHint,
} from "./code-suggestion.utils";
import { parseProductTitle } from "./product-title.utils";
import { classifySeason, extractSeason, formatSeason } from "./season.utils";
import { signerInitials } from "./signer-initials.utils";
import { buildTeamDictionary, learnCodePrefix } from "./team-dictionary.utils";
import {
  extractTeam,
  fallbackTeamAbbreviation,
  isKnownTeam,
  itemTypeLetters,
  resolveTeamKey,
  teamKey,
} from "./team-names.utils";

const CITY: CodeHistoryItem[] = [
  // newest first
  {
    code: "IS100004PFM",
    item: "Manchester City Home Shirt 2024-25",
    signerNames: ["Phil Foden"],
    orderName: "#100004",
  },
  {
    code: "IS100003KDBMC",
    item: "Manchester City Home Shirt 2023-24",
    signerNames: ["Kevin De Bruyne"],
    orderName: "#100003",
  },
  {
    code: "IS100002EHMC",
    item: "Manchester City Away Shirt 2022-23",
    signerNames: ["Erling Haaland"],
    orderName: "#100002",
  },
  {
    code: "IS100001BSMC",
    item: "Manchester City Home Shirt 2021-22",
    signerNames: ["Bernardo Silva"],
    orderName: "#100001",
  },
];
const FODEN_PRODUCT: CodeHistoryItem = {
  ...CITY[0],
  productId: "gid://shopify/Product/1",
};
const CITY_GROUP: CodeHistoryItem = {
  code: "IS100005MCFC2425",
  item: "Manchester City Home Shirt 2024-25",
  signerNames: ["Rúben Dias", "John Stones", "Ederson"],
  orderName: "#100005",
};
const TINY: TeamDictionary = {
  version: 1,
  prefix: "IS",
  teams: { milan: "M", galatasary: "R", "paris saint germain": "PSG" },
  groupTeams: {},
  aliases: { psg: "paris saint germain" },
  signers: {},
  series: {},
};

describe("seasons", () => {
  it.each([
    ["2015-16", "1516"],
    ["2025–26", "2526"],
    ["2026/27", "2627"],
    ["1998-00", "9800"],
    ["2004-2006", "0406"],
    ["1994", "94"],
    ["2003-2010", "03"],
    ["no year", ""],
  ])("%s → %j", (text, token) =>
    expect(formatSeason(extractSeason(text))).toBe(token),
  );
  it.each([
    ["1516", "2015-16", "yy+yy"],
    ["45", "2004-05", "y+y"],
    ["2015", "2015-16", "yyyy"],
    ["16", "2015-16", "end-yy"],
    ["15", "2015-16", "start-yy"],
    ["94", "1994", "yy"],
    ["", "2015-16", "omitted"],
    ["", "no year", "none"],
    ["22", "2002", "other"],
  ])("classifySeason(%j, %s) = %s", (digits, text, form) =>
    expect(classifySeason(digits, extractSeason(text))).toBe(form),
  );
});

describe("initials and teams", () => {
  it.each([
    ["Marco van Basten", "MB"],
    ["Edwin Van der Sar", "EVS"],
    ["Trent Alexander-Arnold", "TAA"],
    ["Sir Alex Ferguson", "SAF"],
    ["Kaká", "K"],
    ["Diego Simeone (manager)", "DS"],
  ])("signerInitials(%s) = %s", (name, initials) =>
    expect(signerInitials(name)).toBe(initials),
  );
  it("extracts and keys teams", () => {
    expect(teamKey("FC Barcelona")).toBe("barcelona");
    expect(teamKey("Atlético de Madrid")).toBe("atletico madrid");
    expect(teamKey("AFC Ajax")).toBe("ajax");
    expect(
      extractTeam("Roberto Carlos Signed Football Boot", ["Roberto Carlos"]),
    ).toBeNull();
    expect(extractTeam("Désiré Doué Signed PSG Home Shirt")).toEqual({
      name: "PSG",
      key: "psg",
    });
    expect(
      extractTeam("Manchester United Goalkeepers Signed Gloves")?.key,
    ).toBe("manchester united");
    expect(
      extractTeam("Original Borussia Dortmund Football Shirt - 2011-12 Home")
        ?.key,
    ).toBe("borussia dortmund");
    expect(extractTeam("Arsenal FC Original 2004–05 Away Shirt")).toEqual({
      name: "Arsenal FC",
      key: "arsenal",
    });
  });
  it("resolves aliases and one-edit spellings, never short keys", () => {
    expect(resolveTeamKey("psg", TINY)).toBe("paris saint germain");
    expect(resolveTeamKey("galatasaray", TINY)).toBe("galatasary");
    expect(resolveTeamKey("romaa", TINY)).toBe("romaa");
    expect(resolveTeamKey("", TINY)).toBe("");
    expect(isKnownTeam("AC Milan", TINY)).toBe(true);
    expect(isKnownTeam("Galatasaray", TINY)).toBe(true);
    expect(isKnownTeam("Robert Lewandowski", TINY)).toBe(false);
  });
  it("falls back to initials of the key or the item type", () => {
    expect(fallbackTeamAbbreviation("paris saint germain")).toBe("PSG");
    expect(fallbackTeamAbbreviation("norway")).toBe("N");
    expect(
      itemTypeLetters("Roberto Carlos Signed Football Boot", [
        "Roberto Carlos",
      ]),
    ).toBe("FB");
  });
});

describe("segmentSuffix", () => {
  it("splits single, pair and group codes", () => {
    expect(
      segmentSuffix(
        "RLBM1516",
        ["Robert Lewandowski"],
        "Bayern Munich Football Shirt - 2015-16 Home",
      ),
    ).toMatchObject({
      initials: "RL",
      team: "BM",
      season: "1516",
      teamKey: "bayern munich",
      kind: "single",
      ok: true,
    });
    expect(
      segmentSuffix(
        "THDBA",
        ["Thierry Henry", "Dennis Bergkamp"],
        "Arsenal Home Shirt",
      ),
    ).toMatchObject({ initials: "THDB", team: "A", kind: "pair", ok: true });
    expect(
      segmentSuffix(
        "B2627",
        ["Pedri", "Gavi", "Lamine Yamal"],
        "FC Barcelona Home Shirt 2026-27",
      ),
    ).toMatchObject({ initials: "", team: "B", season: "2627", kind: "group" });
    expect(
      segmentSuffix(
        "XYZ",
        ["Robert Lewandowski"],
        "Bayern Munich Football Shirt",
      ),
    ).toMatchObject({ ok: false, initials: null, team: null });
  });
  it("reads irregular initials through a known team abbreviation", () => {
    const votes = new Map([["psg", new Map([["PSG", { count: 3 }]])]]);

    expect(
      segmentSuffix("GCPSG", ["Gonçalo Ramos"], "PSG Home Shirt", votes),
    ).toMatchObject({ initials: "GC", team: "PSG", ok: true, irregular: true });
  });
});

describe("learnCodePrefix", () => {
  const withCode = (code: string) => ({ code, orderName: null });

  it("takes the most frequent prefix of the 50 newest codes, newest on a tie", () => {
    expect(
      learnCodePrefix(
        [
          withCode("US141543VPSG"),
          withCode("IS141542ABC"),
          withCode("IS141541ABC"),
        ],
        "X",
      ),
    ).toBe("IS");
    expect(
      learnCodePrefix([withCode("US141543VPSG"), withCode("IS141542ABC")], "X"),
    ).toBe("US");

    const history = [
      ...Array.from({ length: 30 }, (_unusedValue, index) =>
        withCode(`US1415${String(index).padStart(2, "0")}AB`),
      ),
      ...Array.from({ length: 60 }, (_unusedValue, index) =>
        withCode(`IS1414${String(index).padStart(2, "0")}AB`),
      ),
    ];

    expect(learnCodePrefix(history, "Iconic Shirts")).toBe("US");
  });
  it("falls back to the shop name's initials", () => {
    expect(learnCodePrefix([], "Iconic Shirts")).toBe("IS");
    expect(learnCodePrefix([], "Iconic")).toBe("IC");
    expect(learnCodePrefix([], "")).toBe("");
  });
});

describe("buildTeamDictionary", () => {
  it("'recent' takes the newest usage, 'weighted' the recency-weighted majority", () => {
    expect(buildTeamDictionary(CITY).teams).toEqual({ "manchester city": "M" });
    expect(buildTeamDictionary(CITY, { strategy: "weighted" }).teams).toEqual({
      "manchester city": "MC",
    });
  });
  it("keeps product memory newest first and learns the prefix", () => {
    const dictionary = buildTeamDictionary(CITY, { shopName: "Iconic Shirts" });

    expect(dictionary.prefix).toBe("IS");
    expect(Object.values(dictionary.series)[0]).toEqual(["PF", "M", ""]);
    expect(Object.keys(dictionary.series)).toHaveLength(4);
  });
  it("keeps only the newest maxSeries product memories", () => {
    expect(
      Object.values(buildTeamDictionary(CITY, { maxSeries: 2 }).series),
    ).toEqual([
      ["PF", "M", ""],
      ["KDB", "MC", ""],
    ]);
  });
  it("remembers a product under its id and under its item text", () => {
    expect(Object.keys(buildTeamDictionary([FODEN_PRODUCT]).series)).toEqual([
      "gid://shopify/Product/1|phil foden",
      "i:manchestercityhomeshirt202425|phil foden",
    ]);
  });
  it("aliases a short key to the multi-word key with the same initials", () => {
    const dictionary = buildTeamDictionary([
      {
        code: "IS100002DDPSG",
        item: "PSG Home Shirt 2025-26",
        signerNames: ["Désiré Doué"],
        orderName: "#100002",
      },
      {
        code: "IS100001KMPSG",
        item: "Paris Saint-Germain Home Shirt 2019-20",
        signerNames: ["Kylian Mbappé"],
        orderName: "#100001",
      },
    ]);

    expect(dictionary.aliases).toEqual({ psg: "paris saint germain" });
    expect(dictionary.teams).toEqual({ "paris saint germain": "PSG" });
  });
});

describe("suggestCode", () => {
  const dictionary = buildTeamDictionary(CITY, { shopName: "Iconic Shirts" });

  it.each<[string, Parameters<typeof suggestCode>[0], string, string, string]>([
    [
      "learned team",
      {
        orderName: "#100010",
        signerNames: ["Rodri"],
        item: "Manchester City Home Shirt 2025-26",
      },
      "IS100010RM2526",
      "composed",
      "medium",
    ],
    [
      "no signer",
      {
        orderName: "#100010",
        signerNames: [],
        item: "Manchester City Home Shirt 2025-26",
      },
      "IS100010M2526",
      "composed",
      "low",
    ],
    [
      "new team",
      {
        orderName: "#100010",
        signerNames: ["Erling Haaland"],
        item: "Norway Home Shirt 2026",
      },
      "IS100010EHN26",
      "composed",
      "low",
    ],
    [
      "product memory",
      {
        orderName: "#100010",
        signerNames: ["Phil Foden"],
        item: "Manchester City Home Shirt 2024-25",
      },
      "IS100010PFM2425",
      "series",
      "high",
    ],
    [
      "item without a team",
      {
        orderName: "#100010",
        signerNames: ["Roberto Carlos"],
        item: "Roberto Carlos Signed Football Boot",
      },
      "IS100010RCFB",
      "composed",
      "low",
    ],
    [
      "group",
      {
        orderName: "#100010",
        signerNames: ["Pedri", "Gavi", "Lamine Yamal"],
        item: "Manchester City Home Shirt 2026-27",
      },
      "IS100010M2627",
      "composed",
      "low",
    ],
    [
      "own prefix",
      {
        codePrefix: "US",
        orderName: "#100010",
        signerNames: ["Rodri"],
        item: "Manchester City Home Shirt 2025-26",
      },
      "US100010RM2526",
      "composed",
      "medium",
    ],
  ])("%s", (_description, input, code, source, confidence) =>
    expect(suggestCode(input, dictionary)).toMatchObject({
      code,
      source,
      confidence,
    }),
  );
  it("falls back to the item's memory for an unknown product", () =>
    expect(
      suggestCode(
        {
          orderName: "#100010",
          signerNames: ["Phil Foden"],
          item: FODEN_PRODUCT.item,
          productId: "gid://shopify/Product/2",
        },
        buildTeamDictionary([FODEN_PRODUCT]),
      ),
    ).toMatchObject({ code: "IS100010PFM2425", source: "series" }));
  it("prefers a learned signer exception to the default initials", () => {
    const learned = buildTeamDictionary([
      {
        code: "IS100005KAMC2324",
        item: "Manchester City Home Shirt 2023-24",
        signerNames: ["Kaká"],
        orderName: "#100005",
      },
      ...CITY,
    ]);

    expect(learned.signers).toMatchObject({ kaka: "KA" });
    expect(
      suggestCode(
        {
          orderName: "#100010",
          signerNames: ["Kaká"],
          item: "Manchester City Away Shirt 2025-26",
        },
        learned,
      ),
    ).toMatchObject({ code: "IS100010KAMC2526", source: "composed" });
  });
  it("gives a group the letters learned from groups before the team's", () => {
    const learned = buildTeamDictionary([CITY_GROUP, ...CITY]);
    const input = {
      orderName: "#100010",
      item: "Manchester City Home Shirt 2026-27",
    };

    expect(learned.groupTeams).toEqual({ "manchester city": "MCFC" });
    expect(
      suggestCode({ ...input, signerNames: CITY_GROUP.signerNames }, learned)
        ?.code,
    ).toBe("IS100010MCFC2627");
    expect(
      suggestCode({ ...input, signerNames: ["Rodri"] }, learned)?.code,
    ).toBe("IS100010RM2627");
  });
  it("needs an order", () =>
    expect(
      suggestCode(
        { orderName: "", signerNames: ["Rodri"], item: "x" },
        dictionary,
      ),
    ).toBeNull());
  it("duplicates keep the source's letters and add the season (IS141816PMM → IS141950PMM94)", () => {
    const source = {
      code: "IS141816PMM",
      item: "AC Milan Home Retro Shirt - 1994",
      signerNames: ["Paolo Maldini"],
      orderName: "141816",
    };
    const hinted = withSeriesHint(TINY, source);

    expect(Object.values(hinted.series)[0]).toEqual(["PM", "M", ""]);
    expect(
      suggestCode(
        {
          orderName: "#141950",
          signerNames: ["Paolo Maldini"],
          item: source.item,
        },
        hinted,
      ),
    ).toMatchObject({
      code: "IS141950PMM94",
      source: "series",
      confidence: "high",
    });
  });
});

describe("collisions and retargeting (decision 14)", () => {
  it.each<[string, string[], string, string]>([
    ["IS141524IRL", ["IS141524IRL"], "", "IS141524IRL-2"],
    ["IS141524IRL", ["IS141524IRL", "IS141524IRL-2"], "", "IS141524IRL-3"],
    ["IS141855DBA", ["IS141855DBA"], "0405", "IS141855DBA0405"],
    ["IS141855DBA0405", ["IS141855DBA0405"], "0405", "IS141855DBA0405-2"],
    ["IS141460RM23", ["IS141460RM23"], "2223", "IS141460RM23-2"],
    ["IS141638RLBM1516", ["IS141638RLBD1112"], "1516", "IS141638RLBM1516"],
    [
      "IS141909ABCDEFGHIJKLMNOPQRSTUVWX",
      ["IS141909ABCDEFGHIJKLMNOPQRSTUVWX"],
      "1516",
      "IS141909ABCDEFGHIJKLMNOPQRSTUV-2",
    ],
  ])("%s taken=%j season=%j → %s", (code, taken, season, expected) =>
    expect(resolveCollision(code, new Set(taken), season)).toBe(expected),
  );
  it("shortens a 32-character base before -2 and gives up after -99", () => {
    const long = "IS141909ABCDEFGHIJKLMNOPQRSTUVWX";

    expect(resolveCollision(long, new Set([long]))).toBe(
      "IS141909ABCDEFGHIJKLMNOPQRSTUV-2",
    );

    const base = "IS141909RL";

    expect(
      resolveCollision(
        base,
        new Set([
          base,
          ...Array.from(
            { length: 98 },
            (_unusedValue, index) => `${base}-${index + 2}`,
          ),
        ]),
      ),
    ).toBeNull();
  });
  it("retargets a manual code to a new order", () => {
    expect(retargetCode("IS141909RLBMX", "IS", "#141909", "#141950")).toBe(
      "IS141950RLBMX",
    );
    expect(retargetCode("ABC", "IS", "#141909", "#141950")).toBe("ABC");
  });
});

describe("parseProductTitle (rules 1–7; the full 17 vectors live in tests/quality)", () => {
  const isTeam = (name: string) =>
    ["bayern munich", "real madrid"].includes(teamKey(name));

  it.each<[string, string[], string]>([
    [
      "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
      ["Robert Lewandowski"],
      "Bayern Munich Football Shirt - 2015-16 Home",
    ],
    [
      "Thierry Henry & Dennis Bergkamp Signed Arsenal Home Shirt",
      ["Thierry Henry", "Dennis Bergkamp"],
      "Arsenal Home Shirt",
    ],
    [
      "Atlético Madrid Team-Signed Home Shirt – 2024–25",
      [],
      "Atlético Madrid Team-Signed Home Shirt – 2024–25",
    ],
    [
      "Bayern Munich Signed 2025/26 Home Shirt - Squad Signed Edition",
      [],
      "Bayern Munich Signed 2025/26 Home Shirt - Squad Signed Edition",
    ],
    [
      "Arsenal Home Shirt - Signed by Thierry Henry",
      ["Thierry Henry"],
      "Arsenal Home Shirt",
    ],
  ])("%s", (title, signers, item) =>
    expect(parseProductTitle(title, { isTeam })).toMatchObject({
      signers,
      item,
    }),
  );
});

describe("names that match Object.prototype members", () => {
  const PROTOTYPE_NAMES = [
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
  ];

  it.each(PROTOTYPE_NAMES)("keeps the unknown team key %s", (name) =>
    expect(resolveTeamKey(name, TINY)).toBe(name),
  );
  it.each([
    ["constructor", "IS100010PFC2526"],
    ["__proto__", "IS100010PFP2526"],
    ["toString", "IS100010PFT2526"],
    ["hasOwnProperty", "IS100010PFH2526"],
  ])("composes a code for a %s item", (name, code) =>
    expect(
      suggestCode(
        {
          orderName: "#100010",
          signerNames: ["Phil Foden"],
          item: `${name} Home Shirt 2025-26`,
        },
        TINY,
      ),
    ).toMatchObject({ code, source: "composed", confidence: "low" }),
  );
  it.each([
    ["constructor", "IS100010CM2526"],
    ["__proto__", "IS100010PM2526"],
    ["toString", "IS100010TM2526"],
    ["hasOwnProperty", "IS100010HM2526"],
  ])("composes a code for the signer %s", (name, code) =>
    expect(
      suggestCode(
        {
          orderName: "#100010",
          signerNames: [name],
          item: "AC Milan Home Shirt 2025-26",
        },
        TINY,
      ),
    ).toMatchObject({ code, source: "composed", confidence: "medium" }),
  );
  it("learns a team called Constructor and keeps it through JSON", () => {
    const dictionary = buildTeamDictionary([
      {
        code: "IS100002EHCN2324",
        item: "Constructor Away Shirt 2023-24",
        signerNames: ["Erling Haaland"],
        orderName: "#100002",
      },
      {
        code: "IS100001PFCN2223",
        item: "Constructor Home Shirt 2022-23",
        signerNames: ["Phil Foden"],
        orderName: "#100001",
      },
    ]);
    const input = {
      orderName: "#100010",
      signerNames: ["Rodri"],
      item: "Constructor Home Shirt 2025-26",
    };

    expect(dictionary.teams).toEqual({ constructor: "CN" });
    expect(isKnownTeam("Constructor", dictionary)).toBe(true);
    expect(suggestCode(input, dictionary)).toMatchObject({
      code: "IS100010RCN2526",
      confidence: "medium",
    });
    expect(
      suggestCode(
        input,
        JSON.parse(JSON.stringify(dictionary)) as TeamDictionary,
      ),
    ).toEqual(suggestCode(input, dictionary));
  });
  it("reads entries stored under those names", () => {
    const dictionary: TeamDictionary = {
      ...TINY,
      teams: Object.fromEntries([
        ["__proto__", "PR"],
        ["constructor", "CN"],
      ]),
      signers: { constructor: "CR" },
    };

    expect(resolveTeamKey("__proto__", dictionary)).toBe("__proto__");
    expect(isKnownTeam("Constructor", dictionary)).toBe(true);
    expect(
      suggestCode(
        {
          orderName: "#100010",
          signerNames: ["Constructor"],
          item: "AC Milan Home Shirt 2025-26",
        },
        dictionary,
      )?.code,
    ).toBe("IS100010CRM2526");
  });
});
