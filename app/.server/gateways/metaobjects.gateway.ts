import {
  adminGraphql,
  failureFromUserError,
  noResult,
  type AdminClient,
  type AdminGraphqlOptions,
  type GatewayFailure,
} from "./admin-graphql.gateway";
// Generated enums exist only as types (admin.types.d.ts), so input values are cast to them.
import type { MetaobjectStorefrontAccess } from "~/types/admin.types";

export const COA_TYPE = "coa_certificate";

export type DefinitionField = {
  key: string;
  name: string;
  type: string;
  required?: boolean;
};
export type DefinitionInput = {
  type: string;
  name: string;
  description: string;
  displayNameKey: string;
  access: { storefront: "NONE" };
  fieldDefinitions: DefinitionField[];
};
export type UserErrorResult = GatewayFailure;
export type EntryReference = { id: string; handle: string };
export type EntryValue =
  | string
  | number
  | boolean
  | null
  | EntryValue[]
  | { [key: string]: EntryValue };

const DEFINITION_BY_TYPE = `#graphql
  query CoaDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      type
      fieldDefinitions {
        key
        type {
          name
        }
      }
    }
  }
` as const;

const DEFINITION_CREATE = `#graphql
  mutation CoaDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        type
      }
      userErrors {
        field
        message
        code
      }
    }
  }
` as const;

const DEFINITION_UPDATE = `#graphql
  mutation CoaDefinitionUpdate(
    $id: ID!
    $definition: MetaobjectDefinitionUpdateInput!
  ) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
` as const;

// `values` replaces the whole entry: keys left out are cleared. The `metaobject` argument would
// update only the fields it names, so a value removed in the app would linger in the entry.
const CERTIFICATE_UPSERT = `#graphql
  mutation CoaCertificateUpsert($handle: MetaobjectHandleInput!, $values: JSON!) {
    metaobjectUpsert(handle: $handle, values: $values) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
        code
        elementKey
        elementIndex
      }
    }
  }
` as const;

const CERTIFICATE_DELETE = `#graphql
  mutation CoaCertificateDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
        code
      }
    }
  }
` as const;

const CERTIFICATE_BY_HANDLE = `#graphql
  query CoaCertificateByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      id
      handle
    }
  }
` as const;

const CERTIFICATE_ENTRIES = `#graphql
  query CoaCertificateEntries($type: String!, $after: String) {
    metaobjects(type: $type, first: 250, after: $after) {
      nodes {
        id
        handle
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
` as const;

function toFieldInput(field: DefinitionField) {
  return field.required === undefined
    ? { key: field.key, name: field.name, type: field.type }
    : {
        key: field.key,
        name: field.name,
        type: field.type,
        required: field.required,
      };
}

export async function getDefinition(
  admin: AdminClient,
  options?: AdminGraphqlOptions,
): Promise<{ id: string; fields: { key: string; type: string }[] } | null> {
  const data = await adminGraphql(
    admin,
    DEFINITION_BY_TYPE,
    { type: COA_TYPE },
    options,
  );
  const definition = data.metaobjectDefinitionByType;

  if (!definition) {
    return null;
  }

  return {
    id: definition.id,
    fields: definition.fieldDefinitions.map((field) => ({
      key: field.key,
      type: field.type.name,
    })),
  };
}

export async function createDefinition(
  admin: AdminClient,
  input: DefinitionInput,
  options?: AdminGraphqlOptions,
): Promise<{ ok: true; id: string } | UserErrorResult> {
  // Built field by field so no access.admin key can reach Shopify: the type stays merchant-owned.
  const definition = {
    type: input.type,
    name: input.name,
    description: input.description,
    displayNameKey: input.displayNameKey,
    access: {
      storefront: input.access.storefront as MetaobjectStorefrontAccess,
    },
    fieldDefinitions: input.fieldDefinitions.map(toFieldInput),
  };
  const data = await adminGraphql(
    admin,
    DEFINITION_CREATE,
    { definition },
    options,
  );
  const result = data.metaobjectDefinitionCreate;
  const error = result?.userErrors[0];

  if (error) {
    return failureFromUserError(error);
  }

  const created = result?.metaobjectDefinition;

  return created
    ? { ok: true, id: created.id }
    : noResult("metaobjectDefinitionCreate");
}

export async function addDefinitionFields(
  admin: AdminClient,
  id: string,
  fields: DefinitionField[],
  options?: AdminGraphqlOptions,
): Promise<{ ok: true } | UserErrorResult> {
  const definition = {
    fieldDefinitions: fields.map((field) => ({ create: toFieldInput(field) })),
  };
  const data = await adminGraphql(
    admin,
    DEFINITION_UPDATE,
    { id, definition },
    options,
  );
  const result = data.metaobjectDefinitionUpdate;
  const error = result?.userErrors[0];

  if (error) {
    return failureFromUserError(error);
  }

  return result?.metaobjectDefinition
    ? { ok: true }
    : noResult("metaobjectDefinitionUpdate");
}

export async function upsertEntry(
  admin: AdminClient,
  handle: string,
  values: Record<string, EntryValue>,
  options?: AdminGraphqlOptions,
): Promise<({ ok: true } & EntryReference) | UserErrorResult> {
  const data = await adminGraphql(
    admin,
    CERTIFICATE_UPSERT,
    { handle: { type: COA_TYPE, handle }, values },
    options,
  );
  const result = data.metaobjectUpsert;
  const error = result?.userErrors[0];

  if (error) {
    return failureFromUserError(error);
  }

  const entry = result?.metaobject;

  return entry
    ? { ok: true, id: entry.id, handle: entry.handle }
    : noResult("metaobjectUpsert");
}

export async function deleteEntry(
  admin: AdminClient,
  id: string,
  options?: AdminGraphqlOptions,
): Promise<{ ok: true } | GatewayFailure> {
  const data = await adminGraphql(admin, CERTIFICATE_DELETE, { id }, options);
  const error = data.metaobjectDelete?.userErrors[0];

  // Already gone (deleted by hand in the admin): the goal of the delete is met.
  if (!error || error.code === "RECORD_NOT_FOUND") {
    return { ok: true };
  }

  return { ok: false, code: error.code ?? "UNKNOWN", message: error.message };
}

export async function findEntryByHandle(
  admin: AdminClient,
  handle: string,
  options?: AdminGraphqlOptions,
): Promise<EntryReference | null> {
  const data = await adminGraphql(
    admin,
    CERTIFICATE_BY_HANDLE,
    { handle: { type: COA_TYPE, handle } },
    options,
  );
  const entry = data.metaobjectByHandle;

  return entry ? { id: entry.id, handle: entry.handle } : null;
}

async function entriesPage(
  admin: AdminClient,
  after: string | null,
  options: AdminGraphqlOptions,
): Promise<{ entries: EntryReference[]; next: string | null }> {
  const data = await adminGraphql(
    admin,
    CERTIFICATE_ENTRIES,
    { type: COA_TYPE, after },
    { ...options, pace: true },
  );
  const { nodes, pageInfo } = data.metaobjects;

  return {
    entries: nodes.map((node) => ({ id: node.id, handle: node.handle })),
    next: pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null,
  };
}

export async function* listEntries(
  admin: AdminClient,
  options: AdminGraphqlOptions = {},
): AsyncGenerator<EntryReference> {
  let page = await entriesPage(admin, null, options);

  yield* page.entries;

  while (page.next !== null) {
    page = await entriesPage(admin, page.next, options);
    yield* page.entries;
  }
}
