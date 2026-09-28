import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/.server/db/prisma.singleton";
import { suggestCode } from "~/features/codes/utils/code-suggestion.utils";
import { codeHistory } from "~/.server/repositories/certificate-codes.repository";
import {
  getCertificate,
  updateCertificateRow,
} from "~/.server/repositories/certificate.repository";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../../tests/fakes/admin-api.fake";
import {
  createCertificateRow,
  makeWrite,
  OTHER_SHOP,
  SHOP,
} from "../../../../tests/helpers/certificate-row.factory";
import {
  checkCode,
  dropCodeDictionary,
  getCodeDictionary,
} from "./codes.service";
import { clearShopInfoCache } from "~/.server/services/shop/shop-info.service";

vi.mock(
  "~/.server/repositories/certificate-codes.repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/.server/repositories/certificate-codes.repository")
      >();

    return { ...actual, codeHistory: vi.fn(actual.codeHistory) };
  },
);

let fake: FakeAdmin;
const context = () => ({ shop: SHOP, admin: fake.client });
const at = (dayOfJanuary: number) =>
  new Date(Date.UTC(2026, 0, dayOfJanuary, 12));
const person = (name: string) => ({ name, date: null, location: null });

const SNEIJDER = {
  code: "IS141599WSR",
  item: "Galatasaray Home Shirt - 2013-2014",
  orderName: "#141599",
  signers: [person("Wesley Sneijder")],
};
const ICARDI = {
  code: "IS141950MIG2526",
  item: "Galatasaray Home Shirt 2025-26",
  orderName: "#141950",
  signers: [person("Mauro Icardi")],
};
const TORREIRA = {
  orderName: "#141990",
  signerNames: ["Lucas Torreira"],
  item: "Galatasaray Home Shirt 2026-27",
};

beforeEach(() => {
  fake = createFakeAdmin();
  clearShopInfoCache();
  dropCodeDictionary(SHOP);
  vi.mocked(codeHistory).mockClear();
});

describe("getCodeDictionary (spec §4.6, §12.4 #23)", () => {
  it("reuses the dictionary while the history is unchanged", async () => {
    await createCertificateRow(SNEIJDER, { createdAt: at(1) });

    const first = await getCodeDictionary(context());
    const second = await getCodeDictionary(context());

    expect(second).toBe(first);
    expect(codeHistory).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the dictionary once the shop's entry is dropped", async () => {
    await createCertificateRow(SNEIJDER, { createdAt: at(1) });
    await getCodeDictionary(context());

    dropCodeDictionary(SHOP);
    await getCodeDictionary(context());

    expect(codeHistory).toHaveBeenCalledTimes(2);
  });

  it("reflects a new row immediately after dropCodeDictionary", async () => {
    await createCertificateRow(SNEIJDER, { createdAt: at(1) });
    await getCodeDictionary(context());
    await createCertificateRow(ICARDI, { createdAt: at(2) });

    dropCodeDictionary(SHOP);

    const dictionary = await getCodeDictionary(context());

    expect(suggestCode(TORREIRA, dictionary)?.parts.team).toBe("G");
    expect(codeHistory).toHaveBeenCalledTimes(2);
  });

  it("reflects a write made directly with Prisma, because the history stamp changes", async () => {
    await createCertificateRow(SNEIJDER, { createdAt: at(1) });
    await getCodeDictionary(context());
    await createCertificateRow(ICARDI, { createdAt: at(2) });

    const dictionary = await getCodeDictionary(context());

    expect(suggestCode(TORREIRA, dictionary)?.parts.team).toBe("G");
    expect(codeHistory).toHaveBeenCalledTimes(2);
  });

  it("learns the team letters from the newest certificate, even after an older one is edited", async () => {
    const older = await createCertificateRow(SNEIJDER, { createdAt: at(1) });
    await createCertificateRow(ICARDI, { createdAt: at(2) });

    expect(
      suggestCode(TORREIRA, await getCodeDictionary(context()))?.parts.team,
    ).toBe("G");

    await prisma.$transaction((transaction) =>
      updateCertificateRow(
        transaction,
        SHOP,
        older.id,
        makeWrite({ ...SNEIJDER, code: "IS141599WSGA" }),
      ),
    );

    expect((await getCertificate(SHOP, older.id))?.createdAt).toEqual(at(1));
    expect(
      suggestCode(TORREIRA, await getCodeDictionary(context()))?.parts.team,
    ).toBe("G");
    expect(codeHistory).toHaveBeenCalledTimes(2);
  });

  it("learns the prefix from the shop's codes without reading the shop", async () => {
    await createCertificateRow(SNEIJDER, { createdAt: at(1) });

    expect((await getCodeDictionary(context())).prefix).toBe("IS");
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(0);
  });

  it("takes the prefix from the shop name's initials when the shop has no codes", async () => {
    await createCertificateRow(SNEIJDER, { shop: OTHER_SHOP });

    expect((await getCodeDictionary(context())).prefix).toBe("IST");
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(1);
  });

  it("tries the shop name again when it couldn't be read", async () => {
    fake.failNext("CoaShopInfo", { throw: "network" });

    expect((await getCodeDictionary(context())).prefix).toBe("");
    expect((await getCodeDictionary(context())).prefix).toBe("IST");
  });
});

describe("checkCode", () => {
  it("reports a free code in its canonical form", async () => {
    expect(await checkCode(SHOP, " is141990ltg2627 ")).toEqual({
      code: "IS141990LTG2627",
      error: null,
      available: true,
      usedBy: null,
    });
  });

  it("names the certificate that already uses a code", async () => {
    const owner = await createCertificateRow({
      ...ICARDI,
      signers: [person("Mauro Icardi"), person("Dries Mertens")],
    });

    expect(await checkCode(SHOP, "IS141950MIG2526")).toEqual({
      code: "IS141950MIG2526",
      error: null,
      available: false,
      usedBy: {
        id: owner.id,
        signers: "Mauro Icardi and Dries Mertens",
        item: "Galatasaray Home Shirt 2025-26",
      },
    });
  });

  it("treats the certificate's own code as available", async () => {
    const ownCertificate = await createCertificateRow(ICARDI);

    expect(
      await checkCode(SHOP, "IS141950MIG2526", ownCertificate.id),
    ).toMatchObject({
      available: true,
      usedBy: null,
    });
  });

  it("doesn't look up a malformed code", async () => {
    await createCertificateRow(ICARDI);

    expect(await checkCode(SHOP, "IS141950 MIG/2526")).toEqual({
      code: "IS141950MIG/2526",
      error: "Use only letters, numbers, and hyphens.",
      available: false,
      usedBy: null,
    });
    expect(await checkCode(SHOP, "A".repeat(100))).toEqual({
      code: "A".repeat(64),
      error: "Use between 4 and 32 characters.",
      available: false,
      usedBy: null,
    });
  });
});
