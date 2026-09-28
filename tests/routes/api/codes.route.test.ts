import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "~/routes/api/codes.route";
import { createFakeAdmin } from "../../fakes/admin-api.fake";
import {
  createCertificateRow,
  OTHER_SHOP,
} from "../../helpers/certificate-row.factory";
import {
  getRequest,
  mockAdmin,
  readJson,
  routeArguments,
} from "../route-test.utils";

vi.mock("~/.server/shopify/shopify-app.config", () => ({
  authenticate: { admin: vi.fn() },
}));

const check = async (search: string) =>
  readJson(await loader(routeArguments(getRequest(`/api/codes${search}`))));

beforeEach(() => {
  mockAdmin(createFakeAdmin());
});

describe("GET /api/codes (spec §5)", () => {
  it("reports a free code in its canonical form", async () => {
    expect(await check("?code=is141909%20ars0")).toEqual({
      status: 200,
      body: {
        code: "IS141909ARS0",
        error: null,
        available: true,
        usedBy: null,
      },
    });
  });

  it("names the certificate that already uses a code", async () => {
    const taken = await createCertificateRow();

    expect(await check("?code=IS141909ARS0")).toEqual({
      status: 200,
      body: {
        code: "IS141909ARS0",
        error: null,
        available: false,
        usedBy: {
          id: taken.id,
          signers: "Thierry Henry",
          item: "Arsenal Home Shirt 2003-04",
        },
      },
    });
  });

  it("treats the certificate's own code as free when it is excluded", async () => {
    const own = await createCertificateRow();

    expect(
      (await check(`?code=IS141909ARS0&exclude=${own.id}`)).body,
    ).toMatchObject({ available: true, usedBy: null });
  });

  it("ignores codes of other shops", async () => {
    await createCertificateRow({}, { shop: OTHER_SHOP });

    expect((await check("?code=IS141909ARS0")).body).toMatchObject({
      available: true,
    });
  });

  it.each([
    ["?code=IS1", "IS1", "Use between 4 and 32 characters."],
    [
      "?code=IS141909%2FARS0",
      "IS141909/ARS0",
      "Use only letters, numbers, and hyphens.",
    ],
    ["", "", "Enter a certificate code."],
  ])("explains why %j isn't a valid code", async (search, code, error) => {
    expect(await check(search)).toEqual({
      status: 200,
      body: { code, error, available: false, usedBy: null },
    });
  });

  it.each(["?code=IS141909ARS0&exclude=abc", "?code=IS141909ARS0&exclude="])(
    "answers 422 for a malformed exclude (%s)",
    async (search) => {
      expect(await check(search)).toEqual({
        status: 422,
        body: { ok: false },
      });
    },
  );
});
