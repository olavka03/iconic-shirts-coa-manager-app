import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "~/routes/app/certificate-edit.route";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";
import { clearShopInfoCache } from "~/.server/services/shop/shop-info.service";
import { createFakeAdmin } from "../../fakes/admin-api.fake";
import {
  createCertificateRow,
  OTHER_SHOP,
  SHOP,
} from "../../helpers/certificate-row.factory";
import { getRequest, mockAdmin, routeArguments } from "../route-test.utils";
import { testId } from "../../helpers/test-ids.utils";

vi.mock("~/.server/shopify/shopify-app.config", () => ({
  authenticate: { admin: vi.fn() },
}));

const NOT_FOUND = { init: { status: 404 } };

const loadCertificate = async (id: string) =>
  (await loader(routeArguments(getRequest(`/app/certificates/${id}`), { id })))
    .form;

beforeEach(() => {
  mockAdmin(createFakeAdmin());
  clearShopInfoCache();
  dropCodeDictionary(SHOP);
});

describe("GET /app/certificates/:id (spec §5)", () => {
  it.each(["abc", "42", `${testId(1)}0`, "-3"])(
    "answers 404 for the invalid id %s",
    async (id) => {
      await expect(loadCertificate(id)).rejects.toMatchObject(NOT_FOUND);
    },
  );

  it("streams no form (the page shows Not found) for a missing id and another shop's id", async () => {
    const foreign = await createCertificateRow({}, { shop: OTHER_SHOP });

    expect(await loadCertificate(testId(999999))).toBeNull();
    expect(await loadCertificate(foreign.id)).toBeNull();
  });

  it("loads an own certificate for editing", async () => {
    const own = await createCertificateRow();

    expect(await loadCertificate(own.id)).toMatchObject({
      kind: "edit",
      codePrefix: "IS",
      certificate: { id: own.id, values: { code: "IS141909ARS0" } },
    });
  });
});
