import { describe, expect, it } from "vitest";
import type { Transaction } from "~/.server/db/db.types";
import prisma from "~/.server/db/prisma.singleton";
import {
  DEFAULT_LIST_PARAMS,
  type ListParams,
} from "~/features/certificates/utils/list-params.utils";
import type { SignerLike } from "~/features/signers/utils/signer-text.utils";
import {
  createCertificateRow,
  linkedWrite,
  makeWrite,
  OTHER_SHOP,
  SHOP,
} from "../../../tests/helpers/certificate-row.factory";
import {
  codeHistory,
  codesContaining,
  findCodeOwner,
  historyStamp,
  listCodes,
} from "./certificate-codes.repository";
import { listCertificates } from "./certificate-list.repository";
import {
  countCertificates,
  currentVersion,
  deleteCertificateRows,
  getCertificate,
  getMirrorSnapshot,
  getVerificationSource,
  insertCertificate,
  patchSystemFields,
  updateCertificateRow,
} from "./certificate.repository";
import {
  findPendingByFileIds,
  listPendingFileIds,
} from "./pending-media.repository";
import {
  isRecordNotFound,
  isUniqueViolation,
  prismaErrorCode,
} from "~/.server/db/prisma-errors.utils";
import {
  enqueueDelete,
  enqueueUpsert,
  getQueueRow,
} from "./sync-queue.repository";
import { testId } from "../../../tests/helpers/test-ids.utils";

const EMPTY_SHOP = "empty-shop.myshopify.com";
const PAST = new Date("2026-01-01T10:00:00.000Z");

const signer = (
  name: string,
  date: SignerLike["date"] = null,
  location: string | null = null,
): SignerLike => ({ name, date, location });
const day = (isoDate: string) => ({
  precision: "DAY" as const,
  iso: isoDate,
});
const month = (isoMonth: string) => ({
  precision: "MONTH" as const,
  iso: isoMonth,
});
const at = (dayOfJanuary: number) =>
  new Date(Date.UTC(2026, 0, dayOfJanuary, 12));

describe("insertCertificate and updateCertificateRow", () => {
  it("stores signers by position and derives searchText and latestSignedOn", async () => {
    const certificate = await createCertificateRow({
      code: "IS141909-AG",
      orderName: "#141909-UK",
      signers: [
        signer("Thierry Henry", day("2019-11-28"), "London, United Kingdom"),
        signer("Arda Güler", month("2024-03"), "Istanbul, Türkiye"),
      ],
    });
    const row = await prisma.certificate.findUniqueOrThrow({
      where: { id: certificate.id },
      include: { signers: { orderBy: { position: "asc" } } },
    });

    expect(row.signers.map((signer) => [signer.position, signer.name])).toEqual(
      [
        [0, "Thierry Henry"],
        [1, "Arda Güler"],
      ],
    );
    expect(row.signers[1]).toMatchObject({
      signedOn: new Date("2024-03-01T00:00:00Z"),
      datePrecision: "MONTH",
      location: "Istanbul, Türkiye",
    });
    expect(row.latestSignedOn).toEqual(new Date("2024-03-01T00:00:00Z"));
    expect(row.searchText.split(" ")).toEqual(
      expect.arrayContaining([
        "is141909",
        "ag",
        "is141909ag",
        "arsenal",
        "home",
        "shirt",
        "141909",
        "uk",
        "141909uk",
        "thierry",
        "henry",
        "arda",
        "guler",
      ]),
    );
    expect(row.searchText).not.toMatch(/london|kingdom|istanbul|turkiye/);
  });

  it("takes latestSignedOn from the latest date, not the last signer, and sorts by it", async () => {
    const certificate = await createCertificateRow({
      code: "AAAA1",
      signers: [
        signer("Bukayo Saka", day("2024-05-01")),
        signer("Thierry Henry", month("2019-11")),
      ],
    });
    await createCertificateRow({
      code: "BBBB1",
      signers: [signer("Robert Pires", day("2021-06-01"))],
    });
    const row = await prisma.certificate.findUniqueOrThrow({
      where: { id: certificate.id },
    });
    const newestSignedFirst = await listCertificates(SHOP, {
      ...DEFAULT_LIST_PARAMS,
      sort: "signed",
      direction: "desc",
    });

    expect(row.latestSignedOn).toEqual(new Date("2024-05-01T00:00:00Z"));
    expect(newestSignedFirst.rows.map((listed) => listed.code)).toEqual([
      "AAAA1",
      "BBBB1",
    ]);
  });

  it("leaves latestSignedOn null when no signer has a date", async () => {
    const certificate = await createCertificateRow({
      signers: [signer("Robert Pires")],
    });

    expect(
      (
        await prisma.certificate.findUniqueOrThrow({
          where: { id: certificate.id },
        })
      ).latestSignedOn,
    ).toBeNull();
  });

  it("uses the given createdAt for both timestamps and starts at version 1", async () => {
    const certificate = await createCertificateRow({}, { createdAt: PAST });

    expect(certificate).toEqual({
      id: certificate.id,
      code: "IS141909ARS0",
      version: 1,
    });
    expect(await getCertificate(SHOP, certificate.id)).toMatchObject({
      createdAt: PAST,
      updatedAt: PAST,
    });
  });

  it("rejects a second certificate with the same code in one shop only", async () => {
    await createCertificateRow();
    const error = await createCertificateRow().catch(
      (rejection: unknown) => rejection,
    );

    expect(isUniqueViolation(error)).toBe(true);
    expect(prismaErrorCode(error)).toBe("P2002");
    await expect(
      createCertificateRow({}, { shop: OTHER_SHOP }),
    ).resolves.toMatchObject({ code: "IS141909ARS0" });
  });

  it("updateCertificateRow replaces signers, bumps version, moves updatedAt, clears media errors and returns the previous code", async () => {
    const certificate = await createCertificateRow(
      { signers: [signer("Thierry Henry"), signer("Robert Pires")] },
      { createdAt: PAST },
    );
    await prisma.certificate.update({
      where: { id: certificate.id },
      data: { photoError: "NOT_FOUND", videoError: "PROCESSING_FAILED" },
    });

    const updated = await prisma.$transaction((transaction) =>
      updateCertificateRow(
        transaction,
        SHOP,
        certificate.id,
        makeWrite({
          code: "IS141909ARS1",
          signers: [signer("Patrick Vieira", month("2004-05"))],
        }),
      ),
    );

    expect(updated).toEqual({
      id: certificate.id,
      code: "IS141909ARS1",
      version: 2,
      previousCode: "IS141909ARS0",
    });

    const record = await getCertificate(SHOP, certificate.id);

    expect(record).toMatchObject({
      code: "IS141909ARS1",
      version: 2,
      photoError: null,
      videoError: null,
      createdAt: PAST,
      signers: [signer("Patrick Vieira", month("2004-05"))],
    });
    expect(record!.updatedAt.getTime()).toBeGreaterThan(PAST.getTime());
    expect(await prisma.signer.count()).toBe(1);
    expect(
      (
        await prisma.certificate.findUniqueOrThrow({
          where: { id: certificate.id },
        })
      ).searchText,
    ).toContain("patrick vieira");
  });

  it("updateCertificateRow throws P2025 for another shop's certificate and leaves it unchanged", async () => {
    const other = await createCertificateRow({}, { shop: OTHER_SHOP });
    const error = await prisma
      .$transaction((transaction) =>
        updateCertificateRow(
          transaction,
          SHOP,
          other.id,
          makeWrite({ code: "IS141909ARS9" }),
        ),
      )
      .catch((rejection: unknown) => rejection);

    expect(isRecordNotFound(error)).toBe(true);
    expect(prismaErrorCode(error)).toBe("P2025");
    expect(await getCertificate(OTHER_SHOP, other.id)).toMatchObject({
      code: "IS141909ARS0",
      version: 1,
    });
  });

  it("patchSystemFields bumps version, keeps updatedAt and returns null for a missing id", async () => {
    const certificate = await createCertificateRow(
      { photoFileId: "gid://shopify/MediaImage/1" },
      { createdAt: PAST },
    );

    expect(
      await patchSystemFields(prisma, SHOP, certificate.id, {
        photoUrl: "https://cdn.shopify.com/s/files/1/henry.jpg",
      }),
    ).toEqual({ version: 2 });
    expect(await getCertificate(SHOP, certificate.id)).toMatchObject({
      photoUrl: "https://cdn.shopify.com/s/files/1/henry.jpg",
      photoFileId: "gid://shopify/MediaImage/1",
      version: 2,
      updatedAt: PAST,
    });
    expect(
      await patchSystemFields(prisma, SHOP, testId(999999), {
        photoError: "NOT_FOUND",
      }),
    ).toBeNull();
    expect(
      await patchSystemFields(prisma, OTHER_SHOP, certificate.id, {
        photoError: "NOT_FOUND",
      }),
    ).toBeNull();
    expect(await currentVersion(SHOP, certificate.id)).toBe(2);
  });

  it("insertCertificate works on a plain client as well as in a transaction", async () => {
    const certificate = await insertCertificate(prisma, SHOP, makeWrite());

    expect(await currentVersion(SHOP, certificate.id)).toBe(1);
  });
});

describe("reads", () => {
  it("getCertificate returns the record with signers and never another shop's", async () => {
    const certificate = await createCertificateRow(
      linkedWrite({
        notes: "Signed at the training ground.",
        photoFileId: "gid://shopify/MediaImage/7",
        signers: [
          signer("Robert Lewandowski", day("2016-02-01"), "Munich, Germany"),
          signer("Thomas Müller"),
        ],
      }),
      { createdAt: PAST },
    );
    const record = await getCertificate(SHOP, certificate.id);

    expect(Object.keys(record!).sort()).toEqual(
      [
        "code",
        "createdAt",
        "id",
        "item",
        "lineItemId",
        "lineItemTitle",
        "notes",
        "orderId",
        "orderName",
        "photoError",
        "photoFileId",
        "photoUrl",
        "productId",
        "productImageUrl",
        "productTitle",
        "shop",
        "signers",
        "updatedAt",
        "version",
        "videoError",
        "videoFileId",
        "videoPreviewUrl",
        "videoUrl",
      ].sort(),
    );
    expect(record).toMatchObject({
      id: certificate.id,
      shop: SHOP,
      code: "IS141002RLBM1516",
      orderName: "#141002",
      photoFileId: "gid://shopify/MediaImage/7",
      photoUrl: null,
      signers: [
        signer("Robert Lewandowski", day("2016-02-01"), "Munich, Germany"),
        signer("Thomas Müller"),
      ],
    });
    expect(await getCertificate(OTHER_SHOP, certificate.id)).toBeNull();
    expect(await getCertificate(SHOP, testId(999999))).toBeNull();
  });

  it("getVerificationSource returns only the public fields, with no URL for a pending photo", async () => {
    await createCertificateRow(
      linkedWrite({
        notes: "Signed after the match.",
        photoFileId: "gid://shopify/MediaImage/9",
        videoUrl: "https://cdn.shopify.com/videos/c/o/v/lewandowski.mp4",
        videoFileId: "gid://shopify/Video/9",
        productId: "gid://shopify/Product/1",
      }),
    );

    expect(await getVerificationSource(SHOP, "IS141002RLBM1516")).toEqual({
      code: "IS141002RLBM1516",
      item: "Bayern Munich Football Shirt - 2015-16 Home",
      notes: "Signed after the match.",
      photoUrl: null,
      videoUrl: "https://cdn.shopify.com/videos/c/o/v/lewandowski.mp4",
      signers: [signer("Robert Lewandowski")],
    });
    expect(
      await getVerificationSource(OTHER_SHOP, "IS141002RLBM1516"),
    ).toBeNull();
    expect(await getVerificationSource(SHOP, "IS141002RLBM1517")).toBeNull();
  });

  it("findCodeOwner, with and without excludeId", async () => {
    const certificate = await createCertificateRow({
      signers: [signer("Thierry Henry"), signer("Robert Pires")],
    });

    expect(await findCodeOwner(SHOP, "IS141909ARS0")).toEqual({
      id: certificate.id,
      item: "Arsenal Home Shirt 2003-04",
      signerNames: ["Thierry Henry", "Robert Pires"],
    });
    expect(
      await findCodeOwner(SHOP, "IS141909ARS0", certificate.id),
    ).toBeNull();
    expect(await findCodeOwner(OTHER_SHOP, "IS141909ARS0")).toBeNull();
  });

  it("codesContaining finds codes with the token and ignores unsafe tokens", async () => {
    const excluded = await createCertificateRow({ code: "IS141909ARS0" });
    await createCertificateRow({ code: "IS141909ARS1" });
    await createCertificateRow({ code: "IS141002RLBM1516" });
    await createCertificateRow({ code: "IS141909ARS2" }, { shop: OTHER_SHOP });

    expect(await codesContaining(SHOP, "141909")).toEqual([
      "IS141909ARS0",
      "IS141909ARS1",
    ]);
    expect(await codesContaining(SHOP, "141909", excluded.id)).toEqual([
      "IS141909ARS1",
    ]);
    expect(await codesContaining(SHOP, "14%")).toEqual([]);
    expect(await codesContaining(SHOP, "1_1")).toEqual([]);
    expect(await codesContaining(SHOP, "ars")).toEqual([]);
    expect(await codesContaining(SHOP, "")).toEqual([]);
  });

  it("codeHistory is newest first (createdAt, then id) with signer names by position", async () => {
    await createCertificateRow(
      {
        code: "IS141599WSR",
        item: "Galatasaray Home Shirt - 2013-2014",
        signers: [signer("Wesley Sneijder")],
      },
      { createdAt: at(1) },
    );
    await createCertificateRow(
      {
        code: "IS141950MIG2526",
        item: "Galatasaray Home Shirt 2025-26",
        orderName: "#141950",
        signers: [signer("Mauro Icardi"), signer("Lucas Torreira")],
      },
      { createdAt: at(2) },
    );
    await createCertificateRow(
      {
        code: "IS141951DDP2526",
        item: "Galatasaray Away Shirt 2025-26",
        productId: "gid://shopify/Product/7000131",
        signers: [signer("Dries Mertens")],
      },
      { createdAt: at(2) },
    );
    await createCertificateRow({ code: "IS141952X" }, { shop: OTHER_SHOP });

    expect(await codeHistory(SHOP)).toEqual([
      {
        code: "IS141951DDP2526",
        item: "Galatasaray Away Shirt 2025-26",
        signerNames: ["Dries Mertens"],
        orderName: null,
        productId: "gid://shopify/Product/7000131",
      },
      {
        code: "IS141950MIG2526",
        item: "Galatasaray Home Shirt 2025-26",
        signerNames: ["Mauro Icardi", "Lucas Torreira"],
        orderName: "#141950",
        productId: null,
      },
      {
        code: "IS141599WSR",
        item: "Galatasaray Home Shirt - 2013-2014",
        signerNames: ["Wesley Sneijder"],
        orderName: null,
        productId: null,
      },
    ]);
  });

  it("historyStamp changes after an insert, an update and a delete", async () => {
    await createCertificateRow({ code: "AAAA1" }, { createdAt: PAST });
    const initialStamp = await historyStamp(SHOP);
    const certificate = await createCertificateRow(
      { code: "BBBB1" },
      { createdAt: PAST },
    );
    const insertStamp = await historyStamp(SHOP);

    expect(insertStamp).not.toBe(initialStamp);

    await prisma.$transaction((transaction) =>
      updateCertificateRow(
        transaction,
        SHOP,
        certificate.id,
        makeWrite({ code: "BBBB1", item: "Arsenal Away Shirt 2003-04" }),
      ),
    );
    const updateStamp = await historyStamp(SHOP);

    expect(updateStamp).not.toBe(insertStamp);

    await deleteCertificateRows(prisma, SHOP, [certificate.id]);
    const deleteStamp = await historyStamp(SHOP);

    expect(deleteStamp).not.toBe(updateStamp);
    expect(await historyStamp(OTHER_SHOP)).toBe(await historyStamp(EMPTY_SHOP));
  });

  it("listCodes, countCertificates and currentVersion stay in their shop", async () => {
    await createCertificateRow({ code: "BBBB1" });
    const certificateA = await createCertificateRow({ code: "AAAA1" });
    await createCertificateRow({ code: "CCCC1" }, { shop: OTHER_SHOP });

    expect(await listCodes(SHOP)).toEqual(["AAAA1", "BBBB1"]);
    expect(await countCertificates(SHOP)).toBe(2);
    expect(await currentVersion(SHOP, certificateA.id)).toBe(1);
    expect(await currentVersion(OTHER_SHOP, certificateA.id)).toBeNull();
  });
});

describe("listCertificates", () => {
  const list = (overrides: Partial<ListParams> = {}, shop = SHOP) =>
    listCertificates(shop, { ...DEFAULT_LIST_PARAMS, ...overrides });
  const codes = async (overrides: Partial<ListParams> = {}) =>
    (await list(overrides)).rows.map((row) => row.code);

  // A: photo URL, DAY 2019. B: pending photo, video URL, MONTH 2024-03. C: no dates, no media.
  // D: pending video, latest DAY 2023-07-01. E: DAY 2024-03-15. Updated order after the edit: A, E, D, C, B.
  async function seed() {
    const certificateA = await createCertificateRow(
      {
        code: "AAAA1",
        photoUrl: "https://cdn.shopify.com/s/files/1/a.jpg",
        signers: [signer("Thierry Henry", day("2019-11-28"))],
      },
      { createdAt: at(1) },
    );
    await createCertificateRow(
      {
        code: "BBBB1",
        item: "Real Madrid Home Shirt 2023-24",
        photoFileId: "gid://shopify/MediaImage/2",
        videoUrl: "https://cdn.shopify.com/videos/b.mp4",
        signers: [signer("Arda Güler", month("2024-03"))],
      },
      { createdAt: at(2) },
    );
    await createCertificateRow(
      { code: "CCCC1", signers: [signer("Robert Pires")] },
      { createdAt: at(3) },
    );
    await createCertificateRow(
      {
        code: "DDDD1",
        videoFileId: "gid://shopify/Video/4",
        signers: [
          signer("Dennis Bergkamp", day("2021-05-10")),
          signer("Patrick Vieira", day("2023-07-01")),
        ],
      },
      { createdAt: at(4) },
    );
    await createCertificateRow(
      {
        code: "EEEE1",
        signers: [signer("Bukayo Saka", day("2024-03-15"))],
      },
      { createdAt: at(5) },
    );
    await createCertificateRow(
      { code: "ZZZZ1", signers: [signer("Arda Güler", month("2024-03"))] },
      { shop: OTHER_SHOP, createdAt: at(6) },
    );
    await prisma.$transaction((transaction) =>
      updateCertificateRow(
        transaction,
        SHOP,
        certificateA.id,
        makeWrite({
          code: "AAAA1",
          photoUrl: "https://cdn.shopify.com/s/files/1/a.jpg",
          signers: [signer("Thierry Henry", day("2019-11-28"))],
        }),
      ),
    );
  }

  it("sorts by every column in both directions", async () => {
    await seed();

    expect(await codes()).toEqual([
      "EEEE1",
      "DDDD1",
      "CCCC1",
      "BBBB1",
      "AAAA1",
    ]);
    expect(await codes({ sort: "created", direction: "asc" })).toEqual([
      "AAAA1",
      "BBBB1",
      "CCCC1",
      "DDDD1",
      "EEEE1",
    ]);
    expect(await codes({ sort: "updated", direction: "desc" })).toEqual([
      "AAAA1",
      "EEEE1",
      "DDDD1",
      "CCCC1",
      "BBBB1",
    ]);
    expect(await codes({ sort: "updated", direction: "asc" })).toEqual([
      "BBBB1",
      "CCCC1",
      "DDDD1",
      "EEEE1",
      "AAAA1",
    ]);
    expect(await codes({ sort: "signed", direction: "desc" })).toEqual([
      "EEEE1",
      "BBBB1",
      "DDDD1",
      "AAAA1",
      "CCCC1",
    ]);
    expect(await codes({ sort: "signed", direction: "asc" })).toEqual([
      "AAAA1",
      "DDDD1",
      "BBBB1",
      "EEEE1",
      "CCCC1",
    ]);
    expect(await codes({ sort: "code", direction: "asc" })).toEqual([
      "AAAA1",
      "BBBB1",
      "CCCC1",
      "DDDD1",
      "EEEE1",
    ]);
    expect(await codes({ sort: "code", direction: "desc" })).toEqual([
      "EEEE1",
      "DDDD1",
      "CCCC1",
      "BBBB1",
      "AAAA1",
    ]);
  });

  it("filters by photo and video, counting a pending file as present", async () => {
    await seed();

    expect(await codes({ photo: "yes" })).toEqual(["BBBB1", "AAAA1"]);
    expect(await codes({ photo: "no" })).toEqual(["EEEE1", "DDDD1", "CCCC1"]);
    expect(await codes({ video: "yes" })).toEqual(["DDDD1", "BBBB1"]);
    expect(await codes({ video: "no" })).toEqual(["EEEE1", "CCCC1", "AAAA1"]);
    expect(await codes({ photo: "yes", video: "yes" })).toEqual(["BBBB1"]);
  });

  it("filters by signing date, treating a MONTH signer as the whole month", async () => {
    await seed();

    expect(
      await codes({ signedFrom: "2024-03-10", signedTo: "2024-03-31" }),
    ).toEqual(["EEEE1", "BBBB1"]);
    expect(await codes({ signedFrom: "2024-03-16" })).toEqual(["BBBB1"]);
    expect(await codes({ signedTo: "2020-01-01" })).toEqual(["AAAA1"]);
    expect(
      await codes({ signedFrom: "2021-05-01", signedTo: "2021-05-31" }),
    ).toEqual(["DDDD1"]);
  });

  it("searches folded text, every token must match", async () => {
    await seed();

    expect(await codes({ query: "guler" })).toEqual(["BBBB1"]);
    expect(await codes({ query: "GÜLER Arda" })).toEqual(["BBBB1"]);
    expect(await codes({ query: "dddd1" })).toEqual(["DDDD1"]);
    expect(await codes({ query: "arda henry" })).toEqual([]);
  });

  it("returns list rows without notes or order ids, and clamps the page", async () => {
    await seed();
    const result = await list({ page: 7, query: "guler" });

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      pageCount: 1,
      storeIsEmpty: false,
    });
    expect(result.rows).toEqual([
      {
        id: expect.any(String),
        code: "BBBB1",
        item: "Real Madrid Home Shirt 2023-24",
        orderName: null,
        photoUrl: null,
        photoFileId: "gid://shopify/MediaImage/2",
        videoUrl: "https://cdn.shopify.com/videos/b.mp4",
        videoFileId: null,
        photoError: null,
        videoError: null,
        productImageUrl: null,
        signers: [signer("Arda Güler", month("2024-03"))],
      },
    ]);
    expect((await list()).total).toBe(5);
  });

  it("pages by 25 or the chosen size and clamps a page past the end to the last page", async () => {
    await prisma.certificate.createMany({
      data: Array.from({ length: 52 }, (_unusedValue, index) => ({
        shop: SHOP,
        code: `PAGE${String(index).padStart(2, "0")}`,
        createdAt: at(1),
        updatedAt: at(1),
      })),
    });

    expect(await list({ sort: "code", direction: "asc" })).toMatchObject({
      total: 52,
      page: 1,
      pageCount: 3,
    });

    const last = await list({ sort: "code", direction: "asc", page: 9 });

    expect(last).toMatchObject({ page: 3, pageCount: 3 });
    expect(last.rows.map((row) => row.code)).toEqual(["PAGE50", "PAGE51"]);

    const larger = await list({
      sort: "code",
      direction: "asc",
      perPage: 50,
      page: 9,
    });

    expect(larger).toMatchObject({ page: 2, pageCount: 2 });
    expect(larger.rows.map((row) => row.code)).toEqual(["PAGE50", "PAGE51"]);
  });

  it("storeIsEmpty is true only when the shop has no certificates at all", async () => {
    await seed();

    expect(await list({}, EMPTY_SHOP)).toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageCount: 0,
      storeIsEmpty: true,
    });
    expect((await list({ query: "henry" }, EMPTY_SHOP)).storeIsEmpty).toBe(
      true,
    );
    expect((await list({ query: "nobody" })).storeIsEmpty).toBe(false);
    expect(
      (await list({ photo: "yes", video: "no", query: "saka" })).storeIsEmpty,
    ).toBe(false);
  });

  it("never lists another shop's certificates", async () => {
    await seed();

    expect(await codes({ query: "zzzz1" })).toEqual([]);
    expect((await list({}, OTHER_SHOP)).rows.map((row) => row.code)).toEqual([
      "ZZZZ1",
    ]);
  });
});

describe("pending media", () => {
  it("listPendingFileIds and findPendingByFileIds return only files still waiting for a URL", async () => {
    const photo = await createCertificateRow({
      code: "AAAA1",
      photoFileId: "gid://shopify/MediaImage/1",
    });
    const video = await createCertificateRow({
      code: "BBBB1",
      photoFileId: "gid://shopify/MediaImage/3",
      photoUrl: "https://cdn.shopify.com/s/files/1/b.jpg",
      videoFileId: "gid://shopify/Video/2",
    });
    await createCertificateRow({
      code: "CCCC1",
      photoFileId: "gid://shopify/MediaImage/4",
      photoUrl: "https://cdn.shopify.com/s/files/1/c.jpg",
    });
    await createCertificateRow(
      { code: "DDDD1", photoFileId: "gid://shopify/MediaImage/5" },
      { shop: OTHER_SHOP },
    );

    expect((await listPendingFileIds(SHOP)).sort()).toEqual([
      "gid://shopify/MediaImage/1",
      "gid://shopify/Video/2",
    ]);
    expect(
      await findPendingByFileIds(prisma, SHOP, [
        "gid://shopify/MediaImage/1",
        "gid://shopify/Video/2",
        "gid://shopify/MediaImage/4",
        "gid://shopify/MediaImage/5",
      ]),
    ).toEqual([
      {
        id: photo.id,
        code: "AAAA1",
        photoFileId: "gid://shopify/MediaImage/1",
        photoUrl: null,
        videoFileId: null,
        videoUrl: null,
      },
      {
        id: video.id,
        code: "BBBB1",
        photoFileId: "gid://shopify/MediaImage/3",
        photoUrl: "https://cdn.shopify.com/s/files/1/b.jpg",
        videoFileId: "gid://shopify/Video/2",
        videoUrl: null,
      },
    ]);
    expect(await findPendingByFileIds(prisma, SHOP, [])).toEqual([]);
  });
});

describe("getMirrorSnapshot and deleteCertificateRows", () => {
  it("getMirrorSnapshot returns the certificate with its signers and its queue row", async () => {
    const certificate = await createCertificateRow(
      { signers: [signer("Thierry Henry"), signer("Robert Pires")] },
      { enqueue: true },
    );
    const snapshot = await getMirrorSnapshot(SHOP, certificate.id);

    expect(snapshot.certificate).toEqual(
      await getCertificate(SHOP, certificate.id),
    );
    expect(snapshot.certificate!.signers.map((signer) => signer.name)).toEqual([
      "Thierry Henry",
      "Robert Pires",
    ]);
    expect(snapshot.row).toMatchObject({
      certificateId: certificate.id,
      shop: SHOP,
      action: "UPSERT",
      version: 1,
      handle: "is141909ars0",
    });
    expect(await getMirrorSnapshot(OTHER_SHOP, certificate.id)).toEqual({
      certificate: null,
      row: null,
    });
  });

  it("getMirrorSnapshot of a deleted certificate returns only its row", async () => {
    const certificate = await createCertificateRow({}, { enqueue: true });
    await deleteCertificateRows(prisma, SHOP, [certificate.id]);

    expect(await getMirrorSnapshot(SHOP, certificate.id)).toMatchObject({
      certificate: null,
      row: { certificateId: certificate.id, action: "UPSERT" },
    });
  });

  it("deleteCertificateRows deletes only this shop's existing ids and cascades signers", async () => {
    const certificateA = await createCertificateRow({
      code: "AAAA1",
      signers: [signer("Thierry Henry"), signer("Robert Pires")],
    });
    await createCertificateRow({ code: "BBBB1" });
    const other = await createCertificateRow(
      { code: "CCCC1" },
      { shop: OTHER_SHOP },
    );
    await prisma.$transaction((transaction) =>
      updateCertificateRow(
        transaction,
        SHOP,
        certificateA.id,
        makeWrite({ code: "AAAA1" }),
      ),
    );

    expect(
      await deleteCertificateRows(prisma, SHOP, [
        certificateA.id,
        other.id,
        testId(999999),
      ]),
    ).toEqual([{ id: certificateA.id, code: "AAAA1", version: 2 }]);
    expect(
      await prisma.signer.count({ where: { certificateId: certificateA.id } }),
    ).toBe(0);
    expect(await listCodes(SHOP)).toEqual(["BBBB1"]);
    expect(await countCertificates(OTHER_SHOP)).toBe(1);
    expect(await deleteCertificateRows(prisma, SHOP, [])).toEqual([]);
  });
});

describe("overlapping writes of one certificate", () => {
  const sleep = (durationMs: number) =>
    new Promise((resolve) => setTimeout(resolve, durationMs));

  // The first writer's transaction stays open until release(), holding whatever locks it took.
  function holdOpen<Result>(
    write: (transaction: Transaction) => Promise<Result>,
  ) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const done = prisma.$transaction(async (transaction) => {
      const result = await write(transaction);
      await gate;

      return result;
    });

    return { done, release };
  }

  it("a save waits for an overlapping save, so the last save wins with its own signers", async () => {
    const certificate = await createCertificateRow({
      code: "XXXX1",
      signers: [signer("Original signer")],
    });
    const firstSave = holdOpen((transaction) =>
      updateCertificateRow(
        transaction,
        SHOP,
        certificate.id,
        makeWrite({ code: "YYYY1", signers: [signer("Saved by A")] }),
      ),
    );
    await sleep(150);
    let secondSettled = false;
    const secondSave = prisma
      .$transaction((transaction) =>
        updateCertificateRow(
          transaction,
          SHOP,
          certificate.id,
          makeWrite({ code: "ZZZZ1", signers: [signer("Saved by B")] }),
        ),
      )
      .finally(() => (secondSettled = true));
    await sleep(150);

    expect(secondSettled).toBe(false);

    firstSave.release();

    expect(await firstSave.done).toEqual({
      id: certificate.id,
      code: "YYYY1",
      version: 2,
      previousCode: "XXXX1",
    });
    expect(await secondSave).toEqual({
      id: certificate.id,
      code: "ZZZZ1",
      version: 3,
      previousCode: "YYYY1",
    });
    expect(await getCertificate(SHOP, certificate.id)).toMatchObject({
      code: "ZZZZ1",
      version: 3,
      signers: [signer("Saved by B")],
    });
  });

  it("a delete that overlaps a code change returns the new code, so the queue keeps the new handle", async () => {
    const certificate = await createCertificateRow(
      { code: "XXXX1" },
      { enqueue: true },
    );
    const codeChange = holdOpen(async (transaction) => {
      const updated = await updateCertificateRow(
        transaction,
        SHOP,
        certificate.id,
        makeWrite({ code: "YYYY1" }),
      );
      await enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: updated.version,
        handle: "yyyy1",
        previousHandle: "xxxx1",
      });
    });
    await sleep(150);
    let deleteSettled = false;
    const overlappingDelete = prisma
      .$transaction(async (transaction) => {
        const rows = await deleteCertificateRows(transaction, SHOP, [
          certificate.id,
        ]);

        for (const row of rows) {
          await enqueueDelete(transaction, {
            shop: SHOP,
            certificateId: row.id,
            version: row.version,
            handle: row.code.toLowerCase(),
          });
        }

        return rows;
      })
      .finally(() => (deleteSettled = true));
    await sleep(150);

    expect(deleteSettled).toBe(false);

    codeChange.release();
    await codeChange.done;

    expect(await overlappingDelete).toEqual([
      { id: certificate.id, code: "YYYY1", version: 2 },
    ]);
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "DELETE",
      version: 2,
      handle: "yyyy1",
      staleHandles: ["xxxx1"],
    });
    expect(await getCertificate(SHOP, certificate.id)).toBeNull();
  });
});
