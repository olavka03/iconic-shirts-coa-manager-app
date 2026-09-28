import { readFile } from "node:fs/promises";
import {
  adminGraphql,
  type AdminClient,
  type AdminGraphqlOptions,
} from "~/.server/gateways/admin-graphql.gateway";

export type LegacySource = {
  kind: "shop" | "file";
  records: unknown[];
  updatedAt: string | null;
  bytes: number;
};

// Read-only: the legacy metafield is never written by this app.
const LEGACY_CERTIFICATES = `#graphql
  query CoaLegacyCertificates {
    shop {
      metafield(namespace: "custom", key: "certification_verification") {
        jsonValue
        updatedAt
      }
    }
  }
` as const;

export async function fetchLegacyRecords(
  admin: AdminClient,
  options?: AdminGraphqlOptions,
): Promise<LegacySource> {
  const data = await adminGraphql(
    admin,
    LEGACY_CERTIFICATES,
    undefined,
    options,
  );
  const metafield = data.shop.metafield;

  if (!metafield) {
    throw new Error(
      "The shop has no custom.certification_verification metafield.",
    );
  }

  const records: unknown = metafield.jsonValue;

  if (!Array.isArray(records)) {
    throw new Error(
      "The custom.certification_verification metafield doesn't hold a JSON array.",
    );
  }

  return {
    kind: "shop",
    records,
    updatedAt: metafield.updatedAt ?? null,
    bytes: Buffer.byteLength(JSON.stringify(records)),
  };
}

export async function readLegacyFile(path: string): Promise<LegacySource> {
  const text = await readFile(path, "utf8");
  const records: unknown = JSON.parse(text);

  if (!Array.isArray(records)) {
    throw new Error(`${path} doesn't hold a JSON array.`);
  }

  return {
    kind: "file",
    records,
    updatedAt: null,
    bytes: Buffer.byteLength(text),
  };
}
