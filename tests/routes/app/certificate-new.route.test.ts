import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "~/routes/app/certificate-new.route";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";
import { clearShopInfoCache } from "~/.server/services/shop/shop-info.service";
import { createFakeAdmin } from "../../fakes/admin-api.fake";
import {
  createCertificateRow,
  linkedWrite,
  OTHER_SHOP,
  SHOP,
} from "../../helpers/certificate-row.factory";
import { getRequest, mockAdmin, routeArguments } from "../route-test.utils";
import { testId } from "../../helpers/test-ids.utils";

vi.mock("~/.server/shopify/shopify-app.config", () => ({
  authenticate: { admin: vi.fn() },
}));

const loadNewCertificate = async (search: string) =>
  (await loader(routeArguments(getRequest(`/app/certificates/new${search}`))))
    .form;

beforeEach(() => {
  mockAdmin(createFakeAdmin());
  clearShopInfoCache();
  dropCodeDictionary(SHOP);
});

describe("GET /app/certificates/new (spec §5)", () => {
  it("serves a blank create form without ?duplicate", async () => {
    await createCertificateRow();

    const data = await loadNewCertificate("");

    expect(data).toMatchObject({
      kind: "create",
      duplicateMissing: false,
      codePrefix: "IS",
    });
    expect(data.codePrefix).toBe(data.codeDictionary.prefix);
  });

  it.each([
    "?duplicate=abc",
    "?duplicate=",
    `?duplicate=${testId(999999)}`,
    "?duplicate=42",
    "?duplicate=-1",
    "?duplicate=1.5",
  ])("serves a blank form flagged duplicateMissing for %s", async (search) => {
    await createCertificateRow();

    expect(await loadNewCertificate(search)).toMatchObject({
      kind: "create",
      duplicateMissing: true,
    });
  });

  it("flags duplicateMissing for another shop's certificate", async () => {
    const foreign = await createCertificateRow({}, { shop: OTHER_SHOP });

    expect(await loadNewCertificate(`?duplicate=${foreign.id}`)).toMatchObject({
      kind: "create",
      duplicateMissing: true,
    });
  });

  it("duplicates an own certificate with an empty code and no order", async () => {
    const source = await createCertificateRow(linkedWrite());

    expect(await loadNewCertificate(`?duplicate=${source.id}`)).toMatchObject({
      kind: "duplicate",
      duplicateOf: { id: source.id, code: "IS141002RLBM1516" },
      initial: { code: "", order: null, lineItem: null },
      codePrefix: "IS",
    });
  });

  it("keeps the empty prefix of a duplicated code (W5-1)", async () => {
    const source = await createCertificateRow(
      linkedWrite({ code: "141002RLBM1516" }),
    );

    expect(await loadNewCertificate(`?duplicate=${source.id}`)).toMatchObject({
      kind: "duplicate",
      codePrefix: "",
    });
  });
});
