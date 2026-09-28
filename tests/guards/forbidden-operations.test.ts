import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { productionFiles } from "./source-files.utils";

const PRODUCTION = productionFiles();
const FORBIDDEN = [
  "metafieldsSet",
  "metafieldsDelete",
  "metafieldDelete",
  "metaobjectDefinitionDelete",
  "metaobjectBulkDelete",
  "fileDelete",
  "orderUpdate",
  "orderEdit",
  "orderCreate",
  "orderClose",
  "orderCancel",
  "orderMarkAsPaid",
];

describe("forbidden operations (spec §12.2)", () => {
  it("scans the production files", () => {
    expect(PRODUCTION).toContain(
      "app/.server/gateways/admin-graphql.gateway.ts",
    );
    expect(PRODUCTION.some((file) => file.endsWith(".test.ts"))).toBe(false);
  });

  it.each(FORBIDDEN)(
    "no production file in app/ or scripts/ mentions %s",
    (name) => {
      // Also catches orderEditBegin, never orderCreatedAt.
      const mention = new RegExp(`\\b${name}(?![a-z])`);

      expect(
        PRODUCTION.filter((file) => mention.test(readFileSync(file, "utf8"))),
      ).toEqual([]);
    },
  );

  it("the dev toml requests exactly the spec's scopes", () => {
    const toml = readFileSync("shopify.app.dev.toml", "utf8");

    expect(/^scopes = "([^"]*)"/m.exec(toml)?.[1]).toBe(
      "read_orders,read_products,write_app_proxy,write_files,write_metaobject_definitions,write_metaobjects",
    );
    expect(toml).not.toMatch(/read_all_orders|_customers/);
  });

  it("hardcodes no order-name symbol in production code", () => {
    const hits = PRODUCTION.filter((file) =>
      /(["'`])#(?:\1|\d|\$\{)/.test(
        readFileSync(file, "utf8").replace(/`#graphql/g, "`"),
      ),
    );

    expect(hits).toEqual([]);
  });

  it("leaves the production app config untouched", () => {
    expect(() =>
      execSync("git diff --quiet HEAD -- shopify.app.toml"),
    ).not.toThrow();
  });
});
