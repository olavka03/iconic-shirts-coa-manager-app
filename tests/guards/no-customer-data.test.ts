import { readFileSync } from "node:fs";
import {
  Kind,
  parse,
  visit,
  type DocumentNode,
  type SelectionSetNode,
} from "graphql";
import { describe, expect, it } from "vitest";
import {
  normalizeOrderSearch,
  orderNameSymbols,
  orderSearchQuery,
} from "~/features/orders/utils/orders.utils";
import { productionFiles } from "./source-files.utils";

type GraphqlSource = { file: string; document: DocumentNode };

const FILES = productionFiles();
const graphqlBodies = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/`#graphql([\s\S]*?)`/g)].map(
    (match) => match[1],
  );
const DOCUMENTS: GraphqlSource[] = FILES.flatMap((file) =>
  graphqlBodies(file).map((body) => ({ file, document: parse(body) })),
);
const CASES = DOCUMENTS.map((source): [string, GraphqlSource] => [
  source.file,
  source,
]);

const ORDER_ALLOW = new Set([
  "id",
  "name",
  "createdAt",
  "cancelledAt",
  "displayFulfillmentStatus",
  "currentSubtotalLineItemsQuantity",
  "lineItems.nodes.id",
  "lineItems.nodes.title",
  "lineItems.nodes.variantTitle",
  "lineItems.nodes.currentQuantity",
  "lineItems.nodes.isGiftCard",
  "lineItems.nodes.image.url",
  "lineItems.nodes.product.id",
  "lineItems.nodes.product.title",
  "lineItems.nodes.product.status",
  "lineItems.nodes.product.featuredMedia.preview.image.url",
  "lineItems.pageInfo.hasNextPage",
  "lineItems.pageInfo.endCursor",
]);
const SHOP_ALLOW = new Set([
  "name",
  "ianaTimezone",
  "orderNumberFormatPrefix",
  "orderNumberFormatSuffix",
  "metafield.jsonValue",
  "metafield.updatedAt",
]);
const DENY = new Set([
  "customer",
  "customers",
  "email",
  "phone",
  "billingAddress",
  "shippingAddress",
  "displayAddress",
  "shippingLine",
  "statusPageUrl",
  "note",
  "customAttributes",
  "clientIp",
  "customerLocale",
  "firstName",
  "lastName",
  "displayName",
  "address1",
  "address2",
  "zip",
  "purchasingEntity",
]);

function paths(
  selectionSet: SelectionSetNode | undefined,
  prefix = "",
): string[] {
  if (!selectionSet) {
    return [prefix];
  }

  return selectionSet.selections.flatMap((selection) => {
    if (selection.kind === Kind.FIELD) {
      return paths(
        selection.selectionSet,
        prefix ? `${prefix}.${selection.name.value}` : selection.name.value,
      );
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      return paths(selection.selectionSet, prefix);
    }

    throw new Error("Named fragments are not used in this app.");
  });
}

function notAllowedOnOrders(selected: string[]): string[] {
  return selected.filter(
    (path) =>
      !(
        path === "pageInfo.hasNextPage" ||
        (path.startsWith("nodes.") && ORDER_ALLOW.has(path.slice(6)))
      ),
  );
}

describe("no customer data (decision 15, spec §12.2)", () => {
  it("finds every document", () => {
    expect(DOCUMENTS.length).toBeGreaterThanOrEqual(13);
  });

  it.each(CASES)(
    "%s selects only allowed order and shop fields",
    (_file, { document }) => {
      for (const definition of document.definitions) {
        if (definition.kind !== Kind.OPERATION_DEFINITION) {
          continue;
        }

        for (const root of definition.selectionSet.selections) {
          if (root.kind !== Kind.FIELD) {
            continue;
          }

          const selected = paths(root.selectionSet);

          if (root.name.value === "order") {
            expect(selected.filter((path) => !ORDER_ALLOW.has(path))).toEqual(
              [],
            );
          }

          if (root.name.value === "orders") {
            expect(notAllowedOnOrders(selected)).toEqual([]);
          }

          if (root.name.value === "shop") {
            expect(selected.filter((path) => !SHOP_ALLOW.has(path))).toEqual(
              [],
            );
          }
        }
      }
    },
  );

  it.each(CASES)(
    "%s selects no denied field and no CUSTOMER_NAME",
    (_file, { document }) => {
      const hits: string[] = [];

      visit(document, {
        Field: (node) => {
          if (DENY.has(node.name.value)) {
            hits.push(node.name.value);
          }
        },
        EnumValue: (node) => {
          if (node.value === "CUSTOMER_NAME") {
            hits.push(node.value);
          }
        },
        // An Order reached through nodes(ids:) or any other interface obeys the same allowlist.
        InlineFragment: (node) => {
          if (node.typeCondition?.name.value === "Order") {
            hits.push(
              ...paths(node.selectionSet).filter(
                (path) => !ORDER_ALLOW.has(path),
              ),
            );
          }
        },
      });

      expect(hits).toEqual([]);
    },
  );

  it("calls admin.graphql( only in the client", () => {
    const callers = FILES.filter(
      (file) =>
        file !== "app/.server/gateways/admin-graphql.gateway.ts" &&
        readFileSync(file, "utf8").includes("admin.graphql("),
    );

    expect(callers).toEqual([]);
  });

  it("builds order searches from name: and status: terms only", () => {
    const inputs = [
      "141909",
      "#141909",
      "1001-A",
      "EN1001",
      "141909 OR customer:x",
      "email:a@b.c",
      "#141909) OR (x",
      "'1'",
      "",
    ];
    const prefixes = [
      "#",
      "#14",
      "EN",
      "",
      "#:",
      "(",
      '"',
      "# OR ",
      "\u00a0",
      "№-",
    ];
    const terms = inputs.flatMap((raw) =>
      prefixes.flatMap((prefix) =>
        [false, true].flatMap((allStatuses) => {
          const query = orderSearchQuery(
            normalizeOrderSearch(raw),
            orderNameSymbols(prefix),
            { allStatuses },
          );

          return (query ?? "")
            .replace(/[()]/g, " ")
            .split(/\s+/)
            .filter(Boolean);
        }),
      ),
    );

    expect(terms.length).toBeGreaterThan(0);
    expect(
      terms.filter(
        (term) =>
          term !== "OR" &&
          term !== "AND" &&
          !/^(name|status):[^:\s()"'\\]+$/.test(term),
      ),
    ).toEqual([]);
  });

  it("names every document with a Coa prefix and interpolates nothing", () => {
    const bodies = FILES.flatMap(graphqlBodies);

    expect(bodies.filter((body) => body.includes("${"))).toEqual([]);
    expect(
      DOCUMENTS.flatMap(({ document }) =>
        document.definitions.flatMap((definition) =>
          definition.kind === Kind.OPERATION_DEFINITION &&
          !/^Coa[A-Z]/.test(definition.name?.value ?? "")
            ? [definition.name?.value ?? "(anonymous)"]
            : [],
        ),
      ),
    ).toEqual([]);
  });
});
