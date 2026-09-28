import { describe, expect, it } from "vitest";
import { parseProductTitle } from "~/features/codes/utils/product-title.utils";
import { signerKey } from "~/features/codes/utils/signer-initials.utils";
import {
  extractTeam,
  isKnownTeam,
  resolveTeamKey,
  teamKey,
} from "~/features/codes/utils/team-names.utils";
import {
  legacyDictionary,
  legacyHistory,
} from "../helpers/legacy-history.fixture";
import {
  photoFileName,
  titleFromPhotoUrl,
} from "../helpers/photo-titles.utils";

describe("parseProductTitle, the 17 vectors of spec §4.3.1", () => {
  const isTeam = (name: string) =>
    ["bayern munich", "real madrid"].includes(teamKey(name));

  it.each<[title: string, signers: string[], item: string]>([
    [
      "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
      ["Robert Lewandowski"],
      "Bayern Munich Football Shirt - 2015-16 Home",
    ],
    [
      "Robert Lewandowski Signed Original Bayern Munich Football Shirt - 2015-16 Home",
      ["Robert Lewandowski"],
      "Original Bayern Munich Football Shirt - 2015-16 Home",
    ],
    [
      "Désiré Doué Signed PSG Home Shirt 2025–26",
      ["Désiré Doué"],
      "PSG Home Shirt 2025–26",
    ],
    [
      "Thierry Henry & Dennis Bergkamp Signed Arsenal Home Shirt",
      ["Thierry Henry", "Dennis Bergkamp"],
      "Arsenal Home Shirt",
    ],
    [
      "Paul Scholes and Ryan Giggs Signed Manchester United 1998-00 Retro Shirt",
      ["Paul Scholes", "Ryan Giggs"],
      "Manchester United 1998-00 Retro Shirt",
    ],
    [
      "Signed Brazil Football Photo - 1982 Goal",
      [],
      "Brazil Football Photo - 1982 Goal",
    ],
    [
      "Zico Signed Brazil Football Photo - 1982 Goal",
      ["Zico"],
      "Brazil Football Photo - 1982 Goal",
    ],
    [
      "Atlético Madrid Team-Signed Home Shirt – 2024–25",
      [],
      "Atlético Madrid Team-Signed Home Shirt – 2024–25",
    ],
    [
      "Manchester United Goalkeepers Triple Signed Glove Display",
      [],
      "Manchester United Goalkeepers Triple Signed Glove Display",
    ],
    [
      "Spain Home Shirt 2024 – Multi Signed",
      [],
      "Spain Home Shirt 2024 – Multi Signed",
    ],
    [
      "Bayern Munich Signed 2025/26 Home Shirt - Squad Signed Edition",
      [],
      "Bayern Munich Signed 2025/26 Home Shirt - Squad Signed Edition",
    ],
    [
      "Real Madrid Home Shirt – 2024/25",
      [],
      "Real Madrid Home Shirt – 2024/25",
    ],
    [
      "Arsenal Home Shirt - Signed by Thierry Henry",
      ["Thierry Henry"],
      "Arsenal Home Shirt",
    ],
    [
      "Roberto Carlos Hand Signed Football Boot",
      ["Roberto Carlos"],
      "Football Boot",
    ],
    [
      "Pedri signed FC Barcelona Home Shirt – 2025/26",
      ["Pedri"],
      "FC Barcelona Home Shirt – 2025/26",
    ],
    [
      "  Kylian  Mbappé Signed Real Madrid Home Shirt 2025–26 ",
      ["Kylian Mbappé"],
      "Real Madrid Home Shirt 2025–26",
    ],
    [
      "Ronaldo Nazário de Lima Signed Real Madrid Home Shirt - 2023-2024",
      ["Ronaldo Nazário de Lima"],
      "Real Madrid Home Shirt - 2023-2024",
    ],
  ])("%j", (title, signers, item) => {
    expect(parseProductTitle(title, { isTeam })).toMatchObject({
      signers,
      item,
    });
  });
});

describe("titles rebuilt from the legacy proof-photo file names", () => {
  const history = legacyHistory();
  const dictionary = legacyDictionary(history);
  const compactSigner = (name: string) => signerKey(name).replace(/\s/g, "");
  const team = (item: string, signers: readonly string[]) =>
    resolveTeamKey(extractTeam(item, signers)?.key ?? "", dictionary);
  const studied = history
    .filter((certificate) => /signed/i.test(photoFileName(certificate.photo)))
    .map((certificate) => ({
      certificate,
      parsed: parseProductTitle(titleFromPhotoUrl(certificate.photo), {
        isTeam: (name) => isKnownTeam(name, dictionary),
      }),
    }));

  it("recover the first signer and the team of at least 94 % of 261 certificates", () => {
    const signerMatches = studied.filter(
      ({ certificate, parsed }) =>
        parsed.signers.length > 0 &&
        compactSigner(parsed.signers[0]) ===
          compactSigner(certificate.signerNames[0]),
    ).length;
    const teamMatches = studied.filter(
      ({ certificate, parsed }) =>
        team(parsed.item, parsed.signers) ===
        team(certificate.item, certificate.signerNames),
    ).length;

    expect(studied).toHaveLength(261);
    expect(signerMatches / studied.length).toBeGreaterThanOrEqual(0.94); // measured 248
    expect(teamMatches / studied.length).toBeGreaterThanOrEqual(0.94); // measured 248
  });
});
