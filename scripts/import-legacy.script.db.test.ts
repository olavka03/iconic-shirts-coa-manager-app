import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { InvalidJwtError } from "@shopify/shopify-api";
import { SessionNotFoundError } from "@shopify/shopify-app-react-router/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { setSleepForTests } from "~/.server/gateways/admin-graphql.gateway";
import prisma from "~/.server/db/prisma.singleton";
import { codeToHandle } from "~/features/codes/utils/code.utils";
import {
  DEFAULT_PER_PAGE,
  parseListParams,
} from "~/features/certificates/utils/list-params.utils";
import { listCodes } from "~/.server/repositories/certificate-codes.repository";
import { listCertificates } from "~/.server/repositories/certificate-list.repository";
import { getCertificate } from "~/.server/repositories/certificate.repository";
import type { CertificateRecord } from "~/.server/repositories/certificate.types";
import { deleteCertificates } from "~/.server/services/certificates/certificate-delete.service";
import { updateCertificate } from "~/.server/services/certificates/certificate-save.service";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";
import { flushBackgroundMirrors } from "~/.server/services/mirror/mirror-background.service";
import { resetMirrorMemos } from "~/.server/services/mirror/mirror-sync.service";
import { toMetaobjectValues } from "~/.server/services/mirror/mirror-values.utils";
import { clearShopInfoCache } from "~/.server/services/shop/shop-info.service";
import { createFakeAdmin, type FakeAdmin } from "../tests/fakes/admin-api.fake";
import fixture from "../tests/fixtures/legacy-certificates.fixture.json";
import {
  createCertificateRow,
  OTHER_SHOP,
  SHOP,
} from "../tests/helpers/certificate-row.factory";
import { runImportLegacy, writeReportFile } from "./import-legacy.script";
import type {
  ImportDependencies,
  ImportReport,
} from "./legacy-import/legacy-import.types";
import { defaultReportPath } from "./legacy-import/legacy-report.utils";

type LegacyEntry = Record<string, string | undefined>;
type ListQuery = Record<string, string>;

const FIXTURE_PATH = fileURLToPath(
  new URL(
    "../tests/fixtures/legacy-certificates.fixture.json",
    import.meta.url,
  ),
);
const RECORDS: LegacyEntry[] = fixture;
const FIRST_RUN_AT = new Date("2026-09-26T12:00:00.000Z");
const NO_SESSION = `No session for ${SHOP}. Open the app in the store admin once, then run the import again.`;
const EXPIRED = `The session for ${SHOP} has expired. Open the app in the store admin, then run the import again.`;
const UNREACHABLE = `Couldn't reach Shopify for ${SHOP}. Try again in a few minutes.`;
const NO_ORDER_FORMAT = "Couldn't read the shop's order number format.";
const REFUSED = "Already imported. Use --only-new.";
const MIRRORED_ALL =
  "Mirror: processed 371, fixed 371, still failing 0, stuck 0.";
const NOTHING_TO_PUSH = "Mirror: nothing to push.";
const NEW_RECORD: LegacyEntry = {
  certificate_verification: "IS141950BSA2425",
  signed: "Bukayo Saka",
  shirt: "Arsenal Home Shirt 2024-25",
  location: "London, United Kingdom",
  date: "1 March 2025",
  photo: "",
  video: "",
  notes: "",
};
const LEGACY_PATTERN_CODES = [
  "IS141909ARS0",
  "IS141909LIV2005",
  "IS141892THDBA",
  "IS141595MBRGN",
  "IS141304CFLJT",
  "IS141854MUGG",
  "IS141460RM23",
  "IS141595SPMS",
  "IS141088AMT2425",
  "IS141111RMTS",
  "IS141464BMS",
];

let fake: FakeAdmin;
let clock: Date;
let output: string[];
let reportPaths: string[];
let temporaryDirectory: string;
let sourceCount = 0;

const temporaryPath = (path: string) =>
  join(temporaryDirectory, path.replace(/[/\\]/g, "_"));

function dependencies(
  overrides: Partial<ImportDependencies> = {},
): ImportDependencies {
  return {
    adminForShop: async (shop) => ({ shop, admin: fake.client }),
    now: () => new Date(clock),
    print: (line) => output.push(line),
    writeFile: async (path, content) => {
      reportPaths.push(path);
      await writeFile(temporaryPath(path), content);
    },
    ...overrides,
  };
}

function runImport(...flags: string[]): Promise<number> {
  return runImportLegacy(["--shop", SHOP, ...flags], dependencies());
}

async function nextRun(...flags: string[]): Promise<number> {
  clock = new Date(clock.getTime() + 60_000);
  fake.calls.length = 0;

  return runImport(...flags);
}

async function lastReport(): Promise<ImportReport> {
  const path = reportPaths.at(-1);

  if (path === undefined) {
    throw new Error("No report was written.");
  }

  return JSON.parse(
    await readFile(temporaryPath(path), "utf8"),
  ) as ImportReport;
}

async function sourceFile(records: unknown[]): Promise<string> {
  sourceCount++;
  const path = join(temporaryDirectory, `source-${sourceCount}.json`);

  await writeFile(path, JSON.stringify(records));

  return path;
}

const importedCodes = (report: ImportReport) =>
  report.records
    .filter((record) => record.action === "import")
    .map((record) => record.code);

const issueCodes = (report: ImportReport, code: string) =>
  report.records
    .filter((record) => record.issues.some((issue) => issue.code === code))
    .map((record) => record.code);

const certificateRows = () =>
  prisma.certificate.findMany({
    where: { shop: SHOP },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      code: true,
      orderId: true,
      orderName: true,
      lineItemId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const listedRows = () =>
  prisma.certificate.findMany({
    where: { shop: SHOP },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      code: true,
      photoUrl: true,
      photoFileId: true,
      videoUrl: true,
      videoFileId: true,
      signers: { select: { signedOn: true, datePrecision: true } },
    },
  });

type ListedRow = Awaited<ReturnType<typeof listedRows>>[number];

// A MONTH date is stored as its 1st, which is also its sort key.
function latestSigned(row: ListedRow): number | null {
  const times = row.signers.flatMap((signer) =>
    signer.signedOn ? [signer.signedOn.getTime()] : [],
  );

  return times.length === 0 ? null : Math.max(...times);
}

// A MONTH date overlaps a range that starts later in its month.
function signedWithin(from: string, to: string) {
  const fromMonth = `${from.slice(0, 7)}-01`;

  return (row: ListedRow) =>
    row.signers.some((signer) => {
      const day = signer.signedOn?.toISOString().slice(0, 10) ?? null;
      const start = signer.datePrecision === "MONTH" ? fromMonth : from;

      return day !== null && day >= start && day <= to;
    });
}

async function importFixture(): Promise<ImportReport> {
  expect(
    await runImport("--apply", "--no-mirror", "--file", FIXTURE_PATH),
  ).toBe(0);

  return lastReport();
}

async function certificateByCode(code: string): Promise<CertificateRecord> {
  const { id } = await prisma.certificate.findUniqueOrThrow({
    where: { shop_code: { shop: SHOP, code } },
    select: { id: true },
  });
  const certificate = await getCertificate(SHOP, id);

  if (!certificate) {
    throw new Error(`${code} is missing.`);
  }

  return certificate;
}

// What the form sends for an imported certificate opened and saved without edits.
const unchangedInput = (certificate: CertificateRecord) => ({
  code: certificate.code,
  order: null,
  lineItem: null,
  item: certificate.item,
  productId: null,
  productHint: null,
  photo: certificate.photoUrl
    ? { source: "url", url: certificate.photoUrl }
    : null,
  video: certificate.videoUrl
    ? { source: "url", url: certificate.videoUrl }
    : null,
  notes: certificate.notes,
  signers: certificate.signers.map((signer) => ({
    name: signer.name,
    date: signer.date,
    location: signer.location ?? "",
  })),
});

// A save replaces the signer rows, so only their own ids are new.
const storedColumns = (id: string) =>
  prisma.certificate.findUniqueOrThrow({
    where: { id },
    omit: { version: true, updatedAt: true },
    include: { signers: { omit: { id: true }, orderBy: { position: "asc" } } },
  });

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "coa-import-legacy-"));
});

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  fake = createFakeAdmin();
  clock = FIRST_RUN_AT;
  output = [];
  reportPaths = [];
  resetMirrorMemos();
  clearShopInfoCache();
  dropCodeDictionary(SHOP);
  setSleepForTests(async () => {});
});

afterEach(async () => {
  await flushBackgroundMirrors();
  setSleepForTests(null);
});

describe("#14 import-legacy CLI", () => {
  it("dry run from a file writes nothing and reports the whole source", async () => {
    expect(await runImport("--file", FIXTURE_PATH)).toBe(0);

    const report = await lastReport();

    expect(await prisma.certificate.count()).toBe(0);
    expect(await prisma.syncFailure.count()).toBe(0);
    expect(reportPaths).toEqual([defaultReportPath("dry-run", FIRST_RUN_AT)]);
    expect(report.run).toEqual({
      mode: "dry-run",
      startedAt: FIRST_RUN_AT.toISOString(),
      shop: SHOP,
      orderNumberFormatPrefix: "#",
      orderNumberFormatSuffix: "",
    });
    expect(report.source).toMatchObject({
      kind: "file",
      updatedAt: null,
      records: 375,
    });
    expect(report.records).toHaveLength(375);
    expect(report.summary).toMatchObject({
      imported: 371,
      skipped: 4,
      signers: 468,
      overridesApplied: 3,
      orderNamesBackfilled: 353,
    });
    expect(fake.calls.map((call) => call.operation)).toEqual(["CoaShopInfo"]);
    expect(output.join("\n")).toContain('prefix "#", suffix ""');
    expect(output.join("\n")).toContain("To import (371):");
  });

  it("--apply imports the fixture oldest first and mirrors every certificate", async () => {
    expect(await runImport("--apply", "--file", FIXTURE_PATH)).toBe(0);

    const report = await lastReport();
    const rows = await certificateRows();
    const withOrderName = rows.filter((row) => row.orderName !== null);
    const entries = [...fake.entries.values()];

    expect(report.run.mode).toBe("apply");
    expect(rows).toHaveLength(371);
    expect(await prisma.signer.count()).toBe(468);
    expect(entries).toHaveLength(371);
    expect(await prisma.syncFailure.count()).toBe(0);
    expect(withOrderName).toHaveLength(353);
    expect(entries.filter((entry) => entry.fields.order_name)).toHaveLength(
      353,
    );
    expect(
      withOrderName.filter(
        (row) =>
          fake.entries.get(codeToHandle(row.code))?.fields.order_name !==
          row.orderName,
      ),
    ).toEqual([]);
    expect(rows.filter((row) => row.orderId !== null)).toEqual([]);
    expect(rows.filter((row) => row.lineItemId !== null)).toEqual([]);
    expect(rows.map((row) => row.code)).toEqual(
      importedCodes(report).reverse(),
    );
    expect(rows.at(-1)?.code).toBe(RECORDS[0].certificate_verification);
    expect(
      rows.map((row) => row.createdAt.getTime() - FIRST_RUN_AT.getTime()),
    ).toEqual(rows.map((_row, index) => index));
    expect(
      rows.filter((row) => row.updatedAt.getTime() !== row.createdAt.getTime()),
    ).toEqual([]);
    expect(output).toContain(MIRRORED_ALL);
  });

  it("--apply reports a mirror push that stopped early and still exits 0", async () => {
    fake.failNext("CoaCertificateUpsert", { throwResponse: 401 });

    expect(await runImport("--apply", "--file", FIXTURE_PATH)).toBe(0);
    expect(output.at(-1)).toBe(
      "Mirror: processed 1, fixed 0, still failing 1, stuck 0. Stopped early (auth); npm run sync:retry retries the rest.",
    );
    expect(await prisma.certificate.count()).toBe(371);
    expect(await prisma.syncFailure.count()).toBe(371);
  });

  it("refuses a second --apply without --only-new while the shop has certificates", async () => {
    await importFixture();

    expect(await nextRun("--apply", "--file", FIXTURE_PATH)).toBe(2);
    expect(output).toContain(REFUSED);
    expect(await prisma.certificate.count()).toBe(371);

    await prisma.certificate.deleteMany({ where: { shop: SHOP } });
    output = [];

    expect(await nextRun("--apply", "--file", FIXTURE_PATH)).toBe(0);
    expect(output).not.toContain(REFUSED);
    expect(await prisma.certificate.count()).toBe(371);
  });

  it("--apply --only-new right after the import imports nothing and makes no metaobject call", async () => {
    expect(await runImport("--apply", "--file", FIXTURE_PATH)).toBe(0);
    expect(await nextRun("--apply", "--only-new", "--file", FIXTURE_PATH)).toBe(
      0,
    );

    const report = await lastReport();

    expect(report.run.mode).toBe("only-new");
    expect(report.summary.imported).toBe(0);
    expect(issueCodes(report, "EXISTS_IN_APP")).toHaveLength(371);
    expect(fake.calls.map((call) => call.operation)).toEqual(["CoaShopInfo"]);
    expect(output.at(-1)).toBe(NOTHING_TO_PUSH);
    expect(await prisma.certificate.count()).toBe(371);
  });

  it("imports a record added at the top as the newest certificate", async () => {
    await importFixture();

    const source = await sourceFile([NEW_RECORD, ...RECORDS]);

    expect(
      await nextRun("--apply", "--only-new", "--no-mirror", "--file", source),
    ).toBe(0);

    const report = await lastReport();
    const rows = await certificateRows();

    expect(importedCodes(report)).toEqual(["IS141950BSA2425"]);
    expect(rows).toHaveLength(372);
    expect(rows.at(-1)).toMatchObject({
      code: "IS141950BSA2425",
      createdAt: clock,
    });
  });

  it("re-adds a code deleted or renamed in the app, and the dry run lists it first", async () => {
    await importFixture();

    const deleted = await certificateByCode("IS141782PSP");
    const renamed = await certificateByCode("IS141887DDC00");
    const context = { shop: SHOP, admin: fake.client };

    await deleteCertificates(context, [deleted.id]);
    expect(
      await updateCertificate(context, renamed.id, {
        ...unchangedInput(renamed),
        code: "IS141887DDC01",
      }),
    ).toMatchObject({ ok: true, code: "IS141887DDC01" });
    await flushBackgroundMirrors();

    expect(await nextRun("--only-new", "--file", FIXTURE_PATH)).toBe(0);
    expect(importedCodes(await lastReport())).toEqual([
      "IS141887DDC00",
      "IS141782PSP",
    ]);
    expect(output.join("\n")).toContain(
      "To import (2):\n  #19 IS141887DDC00\n  #88 IS141782PSP\n",
    );
    expect(await listCodes(SHOP)).toHaveLength(370);

    expect(
      await nextRun(
        "--apply",
        "--only-new",
        "--no-mirror",
        "--file",
        FIXTURE_PATH,
      ),
    ).toBe(0);

    const report = await lastReport();
    const codes = await listCodes(SHOP);

    expect(report.summary.imported).toBe(2);
    expect(codes).toHaveLength(372);
    expect(codes).toEqual(
      expect.arrayContaining(["IS141782PSP", "IS141887DDC00", "IS141887DDC01"]),
    );
  });

  it("skips an edited entry whose code is already in the app", async () => {
    await importFixture();

    const edited = { ...RECORDS[19], location: "London, United Kingdom" };
    const source = await sourceFile(
      RECORDS.map((record, index) => (index === 19 ? edited : record)),
    );

    expect(await nextRun("--apply", "--only-new", "--file", source)).toBe(0);

    const report = await lastReport();
    const record = report.records[19];
    const stored = await prisma.certificate.findFirstOrThrow({
      where: { shop: SHOP, code: "IS141887DDC00" },
      select: { signers: { select: { location: true } } },
    });

    expect(record).toMatchObject({ code: "IS141887DDC00", action: "skip" });
    expect("changed" in record).toBe(false);
    expect(record.issues.map((issue) => issue.code)).toContain("EXISTS_IN_APP");
    expect(report.summary.imported).toBe(0);
    expect(stored.signers).toEqual([{ location: "Abidjan, Ivory Coast" }]);
  });

  it("reads the shop metafield when no file is given, with the same plan as the file", async () => {
    expect(await runImport("--file", FIXTURE_PATH)).toBe(0);

    const fromFile = await lastReport();

    fake.legacyMetafield = {
      jsonValue: RECORDS,
      updatedAt: "2026-09-20T09:00:00Z",
    };

    expect(await nextRun()).toBe(0);

    const fromShop = await lastReport();

    expect(fake.calls.map((call) => call.operation)).toEqual([
      "CoaShopInfo",
      "CoaLegacyCertificates",
    ]);
    expect(fromShop.source).toMatchObject({
      kind: "shop",
      updatedAt: "2026-09-20T09:00:00Z",
      records: 375,
    });
    expect(fromShop.summary).toEqual(fromFile.summary);
    expect(fromShop.records).toEqual(fromFile.records);
  });

  it("--apply --no-mirror leaves one intent row per certificate for the job", async () => {
    expect(
      await runImport("--apply", "--no-mirror", "--file", FIXTURE_PATH),
    ).toBe(0);

    expect(await prisma.certificate.count()).toBe(371);
    expect(
      await prisma.syncFailure.count({
        where: { shop: SHOP, action: "UPSERT", attempts: 0 },
      }),
    ).toBe(371);
    expect(fake.entries.size).toBe(0);
    expect(fake.calls.map((call) => call.operation)).toEqual(["CoaShopInfo"]);
  });

  it("pushes waiting intent rows on a later run that imports nothing", async () => {
    await importFixture();

    expect(await nextRun("--apply", "--only-new", "--file", FIXTURE_PATH)).toBe(
      0,
    );
    expect(fake.entries.size).toBe(371);
    expect(await prisma.syncFailure.count()).toBe(0);
  });

  it("stops with exit 1 when the shop's order number format can't be read", async () => {
    fake.failNext("CoaShopInfo", { throwResponse: 500 });

    expect(await runImport("--apply", "--file", FIXTURE_PATH)).toBe(1);
    expect(output).toContain(NO_ORDER_FORMAT);
    expect(reportPaths).toEqual([]);
    expect(await prisma.certificate.count()).toBe(0);
  });

  it("stops with exit 1 when the shop has no session", async () => {
    const code = await runImportLegacy(
      ["--shop", SHOP, "--file", FIXTURE_PATH],
      dependencies({
        adminForShop: async () => {
          throw new SessionNotFoundError("No offline session");
        },
      }),
    );

    expect(code).toBe(1);
    expect(output).toContain(NO_SESSION);
  });

  it.each([
    [
      "--no-mirror without --apply",
      ["--shop", SHOP, "--no-mirror"],
      "--no-mirror needs --apply.",
    ],
    ["a missing --shop", ["--apply"], "--shop is required."],
    ["an empty --shop", ["--shop", ""], "--shop is required."],
    [
      "an unknown option",
      ["--shop", SHOP, "--force"],
      expect.stringContaining("'--force'"),
    ],
    [
      "a positional argument",
      ["--shop", SHOP, "apply"],
      expect.stringContaining("'apply'"),
    ],
    [
      "an empty --file",
      ["--shop", SHOP, "--file", ""],
      "--file and --report need a path.",
    ],
    [
      "--file without a path",
      ["--shop", SHOP, "--file"],
      expect.stringContaining("'--file <value>'"),
    ],
  ])(
    "exits 1 for %s without calling Shopify",
    async (_label, flags, firstLine) => {
      expect(await runImportLegacy(flags, dependencies())).toBe(1);
      expect(output[0]).toEqual(firstLine);
      expect(fake.calls).toEqual([]);
      expect(reportPaths).toEqual([]);
    },
  );

  it("leaves a code created in the app first alone", async () => {
    const { id } = await createCertificateRow({
      code: "IS141909ARS0",
      item: "Created in the app",
    });

    expect(
      await runImport(
        "--apply",
        "--only-new",
        "--no-mirror",
        "--file",
        FIXTURE_PATH,
      ),
    ).toBe(0);

    const report = await lastReport();

    expect(issueCodes(report, "EXISTS_IN_APP")).toEqual(["IS141909ARS0"]);
    expect(report.summary.imported).toBe(370);
    expect(await prisma.certificate.count()).toBe(371);
    expect(await getCertificate(SHOP, id)).toMatchObject({
      item: "Created in the app",
    });
  });

  it.each([
    ["an expired session", new InvalidJwtError("expired"), EXPIRED],
    [
      "a failed token refresh",
      new Response(null, { status: 500 }),
      UNREACHABLE,
    ],
  ])("stops with exit 1 on %s", async (_label, error, message) => {
    const code = await runImportLegacy(
      ["--shop", SHOP],
      dependencies({
        adminForShop: async () => {
          throw error;
        },
      }),
    );

    expect(code).toBe(1);
    expect(output).toContain(message);
  });

  it("writes the report to the --report path", async () => {
    const path = join(temporaryDirectory, "custom.json");

    expect(await runImport("--file", FIXTURE_PATH, "--report", path)).toBe(0);
    expect(reportPaths).toEqual([path]);
    expect((await lastReport()).run.mode).toBe("dry-run");
    expect(output.at(-1)).toBe(`Report: ${path}`);
  });

  it("the real report writer creates the report's directory", async () => {
    const path = join(
      temporaryDirectory,
      "nested",
      ".coa-import",
      "report.json",
    );

    await writeReportFile(path, "{}");

    expect(await readFile(path, "utf8")).toBe("{}");
  });

  it("prints the error name and message and exits 1 when the source can't be read", async () => {
    expect(await runImport()).toBe(1);
    expect(output.join("\n")).toContain(
      "Error: The shop has no custom.certification_verification metafield.",
    );
    expect(reportPaths).toEqual([]);
  });
});

describe("#13 list over the imported fixture", () => {
  let report: ImportReport;
  let rows: ListedRow[];

  beforeEach(async () => {
    report = await importFixture();
    rows = await listedRows();
  });

  const list = (query: ListQuery = {}, shop = SHOP) =>
    listCertificates(shop, parseListParams(new URLSearchParams(query)));

  const codesWhere = (predicate: (row: ListedRow) => boolean) =>
    rows.filter(predicate).map((row) => row.code);

  async function allCodes(query: ListQuery): Promise<string[]> {
    const codes: string[] = [];

    for (let page = 1; ; page++) {
      const result = await list({ ...query, page: String(page) });

      codes.push(...result.rows.map((row) => row.code));

      if (page >= result.pageCount) {
        return codes;
      }
    }
  }

  // Array.prototype.sort is stable, so ties keep the newest-first order of `rows`.
  function signedOrder(direction: "asc" | "desc"): string[] {
    const sign = direction === "asc" ? 1 : -1;
    const dated = rows.filter((row) => latestSigned(row) !== null);
    const undated = rows.filter((row) => latestSigned(row) === null);
    const sorted = [...dated].sort(
      (left, right) =>
        sign * ((latestSigned(left) ?? 0) - (latestSigned(right) ?? 0)),
    );

    return [...sorted, ...undated].map((row) => row.code);
  }

  it("sorts by every column in both directions, undated certificates last", async () => {
    const newestFirst = importedCodes(report);
    const byCode = await listCodes(SHOP);
    const undated = codesWhere((row) => latestSigned(row) === null);

    expect((await list()).rows.map((row) => row.code)).toEqual(
      newestFirst.slice(0, DEFAULT_PER_PAGE),
    );
    expect(await allCodes({ sort: "created", dir: "desc" })).toEqual(
      newestFirst,
    );
    expect(await allCodes({ sort: "created", dir: "asc" })).toEqual(
      [...newestFirst].reverse(),
    );
    expect(await allCodes({ sort: "updated", dir: "desc" })).toEqual(
      newestFirst,
    );
    expect(await allCodes({ sort: "updated", dir: "asc" })).toEqual(
      [...newestFirst].reverse(),
    );
    expect(await allCodes({ sort: "code", dir: "asc" })).toEqual(byCode);
    expect(await allCodes({ sort: "code", dir: "desc" })).toEqual(
      [...byCode].reverse(),
    );
    expect(undated.length).toBeGreaterThan(0);

    for (const direction of ["asc", "desc"] as const) {
      const codes = await allCodes({ sort: "signed", dir: direction });

      expect(codes).toEqual(signedOrder(direction));
      expect(codes.slice(-undated.length)).toEqual(undated);
    }
  });

  it("filters by photo, video and signing date, a MONTH date overlapping a range inside its month", async () => {
    const withPhoto = codesWhere(
      (row) => row.photoUrl !== null || row.photoFileId !== null,
    );
    const withVideo = codesWhere(
      (row) => row.videoUrl !== null || row.videoFileId !== null,
    );
    const without = (codes: string[]) =>
      codesWhere((row) => !codes.includes(row.code));
    const august2024 = codesWhere(signedWithin("2024-08-01", "2024-08-31"));
    const midApril2026 = codesWhere(signedWithin("2026-04-10", "2026-04-20"));

    expect(withPhoto.length).toBeGreaterThan(0);
    expect(withVideo.length).toBeGreaterThan(0);
    expect(await allCodes({ photo: "yes" })).toEqual(withPhoto);
    expect(await allCodes({ photo: "no" })).toEqual(without(withPhoto));
    expect(await allCodes({ video: "yes" })).toEqual(withVideo);
    expect(await allCodes({ video: "no" })).toEqual(without(withVideo));
    expect(
      await allCodes({ signedFrom: "2024-08-01", signedTo: "2024-08-31" }),
    ).toEqual(august2024);
    expect(august2024).toContain("IS141909LIV2005");
    expect(
      await allCodes({ signedFrom: "2026-04-10", signedTo: "2026-04-20" }),
    ).toEqual(midApril2026);
    expect(midApril2026).toContain("IS141887DDC00");
    expect(await allCodes({ signedFrom: "2026-05-01" })).not.toContain(
      "IS141887DDC00",
    );
    expect(await allCodes({ signedTo: "2026-03-31" })).not.toContain(
      "IS141887DDC00",
    );
  });

  it("finds folded names, codes without hyphens and order names with or without the symbol", async () => {
    const codes = async (searchText: string) =>
      (await list({ q: searchText })).rows.map((row) => row.code);

    expect(await codes("traore")).toEqual(["IS141909LIV2005"]);
    expect(await codes("sorloth")).toEqual(["IS141088AMT2425"]);
    expect(await codes("is141060tkrm")).toEqual(["IS141060-TKRM"]);
    expect((await codes("#141909")).sort()).toEqual([
      "IS141909ARS0",
      "IS141909LIV2005",
    ]);
    expect((await codes("141909")).sort()).toEqual([
      "IS141909ARS0",
      "IS141909LIV2005",
    ]);
  });

  it("counts totals, clamps the page and keeps other shops apart", async () => {
    const first = await list();
    const clamped = await list({ page: "99" });

    expect(first).toMatchObject({
      total: 371,
      page: 1,
      pageCount: 15,
      storeIsEmpty: false,
    });
    expect(first.rows).toHaveLength(DEFAULT_PER_PAGE);
    expect(clamped).toMatchObject({ total: 371, page: 15, pageCount: 15 });
    expect(clamped.rows.map((row) => row.code)).toEqual(
      importedCodes(report).slice(14 * DEFAULT_PER_PAGE),
    );
    expect(await list({ perPage: "100", page: "99" })).toMatchObject({
      page: 4,
      pageCount: 4,
    });
    expect(await list({ q: "nobody-signed-this" })).toMatchObject({
      total: 0,
      storeIsEmpty: false,
    });
    expect(await list({}, OTHER_SHOP)).toMatchObject({
      rows: [],
      total: 0,
      storeIsEmpty: true,
    });
    expect(await list({ q: "traore" }, OTHER_SHOP)).toMatchObject({
      total: 0,
    });
  });
});

describe("§12.8 legacy patterns re-saved without edits", () => {
  it("changes only version and updatedAt, and mirrors the re-read certificate", async () => {
    expect(await runImport("--apply", "--file", FIXTURE_PATH)).toBe(0);

    const context = { shop: SHOP, admin: fake.client };

    for (const code of LEGACY_PATTERN_CODES) {
      const imported = await certificateByCode(code);
      const before = await storedColumns(imported.id);

      expect(
        await updateCertificate(context, imported.id, unchangedInput(imported)),
        code,
      ).toEqual({ ok: true, id: imported.id, code });
      await flushBackgroundMirrors();

      const resaved = await certificateByCode(code);

      expect(await storedColumns(imported.id), code).toEqual(before);
      expect(resaved.version, code).toBe(imported.version + 1);
      expect(resaved.updatedAt.getTime(), code).toBeGreaterThan(
        imported.updatedAt.getTime(),
      );
      expect(fake.entries.get(codeToHandle(code))?.fields, code).toEqual(
        toMetaobjectValues(resaved),
      );
    }

    expect(await prisma.syncFailure.count()).toBe(0);
  });
});
