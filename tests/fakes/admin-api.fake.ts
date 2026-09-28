import { GraphqlQueryError, HttpRequestError } from "@shopify/shopify-api";
import type { AdminClient } from "~/.server/gateways/admin-graphql.gateway";
import type { EntryValue } from "~/.server/gateways/metaobjects.gateway";
import {
  devStoreOrders,
  type FakeLineItem,
  type FakeOrder,
  type FakeProductStatus,
} from "./orders.fake";

// A stateful in-memory Admin API answering every Coa* operation (spec §12.3). It returns what the
// React Router client returns: a Response with { data, extensions: { cost } }.

export type Failure =
  | {
      userError: {
        code: string;
        message?: string;
        field?: string[];
        elementKey?: string;
      };
    }
  | {
      throw: "throttled" | "access_denied" | "network" | "timeout";
      message?: string;
    }
  | { throwResponse: 401 | 403 | 429 | 500 }
  | { applyThenThrow: "timeout" | "network" };
export type FakeCall = {
  operation: string;
  variables: Record<string, unknown>;
};
export type FakeEntry = {
  id: string;
  handle: string;
  fields: Record<string, EntryValue>;
};
export type FakeFile = {
  id: string;
  kind: "photo" | "video";
  status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  mimeType: string;
  url: string | null;
  sources: { url: string; format: string; height: number; mimeType: string }[];
  previewUrl: string | null;
  errorCode: string | null;
  alt: string | null;
};
export type FakeProduct = {
  id: string;
  title: string;
  status: FakeProductStatus;
  imageUrl: string | null;
};
export type FakeShop = {
  name: string;
  ianaTimezone: string;
  orderNumberFormatPrefix: string;
  orderNumberFormatSuffix: string;
};
export type FakeThrottleStatus = {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
};

export interface FakeAdmin {
  client: AdminClient;
  calls: FakeCall[];
  callsTo(operation: string): FakeCall[];
  failNext(operation: string, failure: Failure, times?: number): void;
  definition: { id: string; fields: Map<string, string> } | null;
  entries: Map<string, FakeEntry>;
  createEntryByHand(
    handle: string,
    fields: Record<string, EntryValue>,
  ): FakeEntry;
  deleteEntryByHand(handle: string): void;
  deleteDefinition(): void;
  files: Map<string, FakeFile>;
  addFile(overrides: Partial<FakeFile> & { kind: "photo" | "video" }): FakeFile;
  setFile(id: string, patch: Partial<FakeFile>): void;
  removeFile(id: string): void;
  products: Map<string, FakeProduct>;
  addProduct(overrides?: Partial<FakeProduct>): FakeProduct;
  removeProduct(id: string): void;
  orders: FakeOrder[];
  shop: FakeShop;
  legacyMetafield: { jsonValue: unknown; updatedAt: string } | null;
  throttleStatus: FakeThrottleStatus;
}

type Variables = Record<string, unknown>;
type UserError = {
  field: string[] | null;
  message: string;
  code: string;
  elementKey?: string | null;
  elementIndex?: number | null;
};
type State = {
  fake: FakeAdmin;
  definitionType: string;
  removedProducts: Set<string>;
  next: () => number;
};
type Handler = (state: State, variables: Variables) => unknown;

const OPERATION_NAME = /(?:query|mutation)\s+(Coa\w+)/;
const COA_TYPE = "coa_certificate";
const CDN = "https://cdn.shopify.com/s/files/1/0000/0001/files";
const PAGE = { entries: 250, lineItems: 50 };

const USER_ERROR_PAYLOADS: Record<string, (errors: UserError[]) => unknown> = {
  CoaDefinitionCreate: (userErrors) => ({
    metaobjectDefinitionCreate: { metaobjectDefinition: null, userErrors },
  }),
  CoaDefinitionUpdate: (userErrors) => ({
    metaobjectDefinitionUpdate: { metaobjectDefinition: null, userErrors },
  }),
  CoaCertificateUpsert: (userErrors) => ({
    metaobjectUpsert: {
      metaobject: null,
      userErrors: userErrors.map((userError) => ({
        ...userError,
        elementKey: userError.elementKey ?? null,
        elementIndex: userError.elementIndex ?? null,
      })),
    },
  }),
  CoaCertificateDelete: (userErrors) => ({
    metaobjectDelete: { deletedId: null, userErrors },
  }),
};

function userErrorData(operation: string, error: UserError): unknown {
  const payload = USER_ERROR_PAYLOADS[operation];

  if (!payload) {
    throw new Error(
      `${operation} is a query: userError failures apply to mutations only.`,
    );
  }

  return payload([error]);
}

function graphqlError(message: string, code: string, cost?: unknown) {
  return new GraphqlQueryError({
    message,
    response: {},
    body: {
      errors: { graphQLErrors: [{ message, extensions: { code } }] },
      ...(cost ? { extensions: { cost } } : {}),
    },
  });
}

function thrownError(
  kind: "throttled" | "access_denied" | "network" | "timeout",
  message?: string,
): unknown {
  switch (kind) {
    case "throttled":
      return graphqlError(message ?? "Throttled", "THROTTLED", {
        requestedQueryCost: 12,
        throttleStatus: {
          maximumAvailable: 2000,
          currentlyAvailable: 0,
          restoreRate: 100,
        },
      });
    case "access_denied":
      return graphqlError(
        message ??
          "Access denied for orders field. Required access: `read_orders` access scope.",
        "ACCESS_DENIED",
      );
    case "network":
      return new HttpRequestError(
        message ?? "Http request error, no response available: fetch failed",
      );
    case "timeout":
      return new DOMException(
        message ?? "The operation was aborted due to timeout",
        "TimeoutError",
      );
  }
}

const alphanumericUpper = (text: string) =>
  text.replace(/[^0-9a-z]/gi, "").toUpperCase();

// Shopify's name: filter, not the app's code rule: a name term matches when the alphanumerics
// agree (preflight ruling R6). status: terms are accepted and ignored.
function orderMatcher(query: string | null): (order: FakeOrder) => boolean {
  if (!query) {
    return () => true;
  }

  const tokens = query
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((token) => token !== "" && token !== "OR" && token !== "AND");
  const names = tokens.flatMap((token) => {
    if (token.startsWith("name:")) {
      return [alphanumericUpper(token.slice(5))];
    }

    if (token.startsWith("status:")) {
      return [];
    }

    throw new Error(
      `The fake order search only understands name: and status: terms, got "${token}".`,
    );
  });

  if (names.length === 0) {
    return () => true;
  }

  return (order) => names.includes(alphanumericUpper(order.name));
}

function lineItemProduct(state: State, lineItem: FakeLineItem) {
  if (!lineItem.product || state.removedProducts.has(lineItem.product.id)) {
    return null;
  }

  const { id, title, status, imageUrl } = lineItem.product;

  return { id, title, status, featuredMedia: featuredMedia(imageUrl) };
}

function featuredMedia(url: string | null) {
  return url ? { preview: { image: { url } } } : null;
}

function writeEntry(
  state: State,
  handle: string,
  fields: Record<string, EntryValue>,
): FakeEntry {
  const existing = state.fake.entries.get(handle);

  if (existing) {
    existing.fields = structuredClone(fields);

    return existing;
  }

  const entry = {
    id: `gid://shopify/Metaobject/${state.next()}`,
    handle,
    fields: structuredClone(fields),
  };

  state.fake.entries.set(handle, entry);

  return entry;
}

function fileNode(file: FakeFile) {
  const fileErrors = file.errorCode
    ? [{ code: file.errorCode, message: file.errorCode }]
    : [];

  if (file.kind === "photo") {
    return {
      __typename: "MediaImage",
      id: file.id,
      fileStatus: file.status,
      mimeType: file.mimeType,
      image:
        file.status === "READY" && file.url
          ? { url: file.url, jpgUrl: `${file.url}&format=jpg` }
          : null,
      fileErrors,
    };
  }

  return {
    __typename: "Video",
    id: file.id,
    fileStatus: file.status,
    sources: file.sources.map((source) => ({ ...source })),
    originalSource: file.url ? { url: file.url } : null,
    preview: { image: file.previewUrl ? { url: file.previewUrl } : null },
    fileErrors,
  };
}

type DefinitionFieldInput = { key: string; type: string };

const HANDLERS: Record<string, Handler> = {
  CoaDefinitionByType: (state, variables) => {
    const definition = state.fake.definition;

    if (!definition || variables.type !== state.definitionType) {
      return { metaobjectDefinitionByType: null };
    }

    return {
      metaobjectDefinitionByType: {
        id: definition.id,
        type: state.definitionType,
        fieldDefinitions: [...definition.fields].map(([key, name]) => ({
          key,
          type: { name },
        })),
      },
    };
  },

  CoaDefinitionCreate: (state, variables) => {
    const input = variables.definition as {
      type: string;
      access?: Record<string, unknown>;
      fieldDefinitions?: DefinitionFieldInput[];
    };

    if (input.access && "admin" in input.access) {
      return userErrorData("CoaDefinitionCreate", {
        field: ["definition", "access", "admin"],
        code: "ADMIN_ACCESS_INPUT_NOT_ALLOWED",
        message: "Admin access can only be specified for app-reserved types.",
      });
    }

    if (state.fake.definition) {
      return userErrorData("CoaDefinitionCreate", {
        field: ["definition", "type"],
        code: "TAKEN",
        message: "Type has already been taken",
      });
    }

    const id = `gid://shopify/MetaobjectDefinition/${state.next()}`;

    state.definitionType = input.type;
    state.fake.definition = {
      id,
      fields: new Map(
        (input.fieldDefinitions ?? []).map((field) => [field.key, field.type]),
      ),
    };

    return {
      metaobjectDefinitionCreate: {
        metaobjectDefinition: { id, type: input.type },
        userErrors: [],
      },
    };
  },

  CoaDefinitionUpdate: (state, variables) => {
    const definition = state.fake.definition;

    if (!definition || variables.id !== definition.id) {
      return userErrorData("CoaDefinitionUpdate", {
        field: ["id"],
        code: "RECORD_NOT_FOUND",
        message: "Record not found",
      });
    }

    const input = variables.definition as {
      fieldDefinitions?: { create?: DefinitionFieldInput }[];
    };
    const creates = (input.fieldDefinitions ?? []).flatMap((field) =>
      field.create ? [field.create] : [],
    );
    const taken = creates.findIndex((field) =>
      definition.fields.has(field.key),
    );

    if (taken >= 0) {
      return userErrorData("CoaDefinitionUpdate", {
        field: [
          "definition",
          "fieldDefinitions",
          String(taken),
          "create",
          "key",
        ],
        code: "TAKEN",
        message: "Key has already been taken",
      });
    }

    for (const field of creates) {
      definition.fields.set(field.key, field.type);
    }

    return {
      metaobjectDefinitionUpdate: {
        metaobjectDefinition: { id: definition.id },
        userErrors: [],
      },
    };
  },

  CoaCertificateUpsert: (state, variables) => {
    const { type, handle } = variables.handle as {
      type: string;
      handle: string;
    };
    const input = variables.values;
    const definition = state.fake.definition;

    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw graphqlError(
        "Variable $values of type JSON! was provided invalid value (Expected an object keyed by field definition key)",
        "INVALID_VARIABLE",
      );
    }

    if (!definition || type !== state.definitionType) {
      return userErrorData("CoaCertificateUpsert", {
        field: ["handle", "type"],
        code: "UNDEFINED_OBJECT_TYPE",
        message: `No metaobject definition exists for type "${type}"`,
      });
    }

    const unknown = Object.keys(input).find(
      (key) => !definition.fields.has(key),
    );

    if (unknown !== undefined) {
      return userErrorData("CoaCertificateUpsert", {
        field: ["values"],
        code: "UNDEFINED_OBJECT_FIELD",
        elementKey: unknown,
        message: `No field definition found for "${unknown}"`,
      });
    }

    // A full replacement: keys not sent are cleared, and a null clears its key the same way.
    const values = Object.fromEntries(
      Object.entries(input as Record<string, EntryValue>).filter(
        ([, value]) => value !== null,
      ),
    );

    if (!values.code) {
      return userErrorData("CoaCertificateUpsert", {
        field: ["values"],
        code: "OBJECT_FIELD_REQUIRED",
        elementKey: "code",
        message: "Code can't be blank",
      });
    }

    const entry = writeEntry(state, handle, values);

    return {
      metaobjectUpsert: {
        metaobject: { id: entry.id, handle: entry.handle },
        userErrors: [],
      },
    };
  },

  CoaCertificateDelete: (state, variables) => {
    const entry = [...state.fake.entries.values()].find(
      (candidate) => candidate.id === variables.id,
    );

    if (!entry) {
      return userErrorData("CoaCertificateDelete", {
        field: ["id"],
        code: "RECORD_NOT_FOUND",
        message: "Record not found",
      });
    }

    state.fake.entries.delete(entry.handle);

    return { metaobjectDelete: { deletedId: entry.id, userErrors: [] } };
  },

  CoaCertificateByHandle: (state, variables) => {
    const { type, handle } = variables.handle as {
      type: string;
      handle: string;
    };
    const entry =
      type === state.definitionType
        ? state.fake.entries.get(handle)
        : undefined;

    return {
      metaobjectByHandle: entry ? { id: entry.id, handle: entry.handle } : null,
    };
  },

  CoaCertificateEntries: (state, variables) => {
    const all =
      variables.type === state.definitionType
        ? [...state.fake.entries.values()]
        : [];
    const start =
      typeof variables.after === "string" ? Number(variables.after) : 0;
    const page = all.slice(start, start + PAGE.entries);

    return {
      metaobjects: {
        nodes: page.map((entry) => ({ id: entry.id, handle: entry.handle })),
        pageInfo: {
          hasNextPage: start + page.length < all.length,
          endCursor: page.length > 0 ? String(start + page.length) : null,
        },
      },
    };
  },

  CoaFileStatus: (state, variables) => ({
    nodes: (variables.ids as string[]).map((id) => {
      const file = state.fake.files.get(id);

      return file ? fileNode(file) : null;
    }),
  }),

  CoaProducts: (state, variables) => ({
    nodes: (variables.ids as string[]).map((id) => {
      const product = state.fake.products.get(id);

      return product
        ? {
            id: product.id,
            title: product.title,
            status: product.status,
            featuredMedia: featuredMedia(product.imageUrl),
          }
        : null;
    }),
  }),

  CoaOrderPicker: (state, variables) => {
    const first = variables.first as number;
    const matches = orderMatcher(
      (variables.query as string | null | undefined) ?? null,
    );
    const found = state.fake.orders
      .filter((order) => !order.outsideWindow && matches(order))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return {
      orders: {
        nodes: found.slice(0, first).map((order) => ({
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          cancelledAt: order.cancelledAt,
          displayFulfillmentStatus: order.displayFulfillmentStatus,
          currentSubtotalLineItemsQuantity: order.lineItems.reduce(
            (sum, lineItem) => sum + lineItem.currentQuantity,
            0,
          ),
          lineItems: {
            nodes: order.lineItems.slice(0, 5).map((lineItem) => ({
              title: lineItem.title,
              currentQuantity: lineItem.currentQuantity,
              isGiftCard: lineItem.isGiftCard,
            })),
          },
        })),
        pageInfo: { hasNextPage: found.length > first },
      },
    };
  },

  CoaOrderLineItems: (state, variables) => {
    const order = state.fake.orders.find(
      (candidate) => candidate.id === variables.id,
    );

    if (!order || order.outsideWindow) {
      return { order: null };
    }

    const start =
      typeof variables.after === "string" ? Number(variables.after) : 0;
    const page = order.lineItems.slice(start, start + PAGE.lineItems);

    return {
      order: {
        id: order.id,
        name: order.name,
        createdAt: order.createdAt,
        cancelledAt: order.cancelledAt,
        displayFulfillmentStatus: order.displayFulfillmentStatus,
        lineItems: {
          nodes: page.map((lineItem) => ({
            id: lineItem.id,
            title: lineItem.title,
            variantTitle: lineItem.variantTitle,
            currentQuantity: lineItem.currentQuantity,
            isGiftCard: lineItem.isGiftCard,
            image: lineItem.imageUrl ? { url: lineItem.imageUrl } : null,
            product: lineItemProduct(state, lineItem),
          })),
          pageInfo: {
            hasNextPage: start + page.length < order.lineItems.length,
            endCursor: page.length > 0 ? String(start + page.length) : null,
          },
        },
      },
    };
  },

  CoaShopInfo: (state) => ({ shop: { ...state.fake.shop } }),

  CoaLegacyCertificates: (state) => ({
    shop: {
      metafield: state.fake.legacyMetafield
        ? {
            jsonValue: state.fake.legacyMetafield.jsonValue,
            updatedAt: state.fake.legacyMetafield.updatedAt,
          }
        : null,
    },
  }),
};

function respond(fake: FakeAdmin, data: unknown): Response {
  const body = {
    data,
    extensions: {
      cost: {
        requestedQueryCost: 10,
        actualQueryCost: 10,
        throttleStatus: { ...fake.throttleStatus },
      },
    },
  };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

export function createFakeAdmin(
  seed: {
    orders?: FakeOrder[];
    shop?: Partial<FakeShop>;
    legacy?: unknown[];
  } = {},
): FakeAdmin {
  const failures = new Map<string, Failure[]>();
  let counter = 0;
  const next = () => ++counter;

  const orders = seed.orders ?? devStoreOrders();
  const products = new Map<string, FakeProduct>();
  const lineItems = [...devStoreOrders(), ...orders].flatMap(
    (order) => order.lineItems,
  );

  for (const lineItem of lineItems) {
    if (lineItem.product) {
      products.set(lineItem.product.id, { ...lineItem.product });
    }
  }

  const fake: FakeAdmin = {
    client: { graphql: null as unknown as AdminClient["graphql"] },
    calls: [],
    callsTo: (operation) =>
      fake.calls.filter((call) => call.operation === operation),
    failNext: (operation, failure, times = 1) => {
      const queue = failures.get(operation) ?? [];

      queue.push(...Array.from({ length: times }, () => failure));
      failures.set(operation, queue);
    },
    definition: null,
    entries: new Map(),
    createEntryByHand: (handle, fields) => writeEntry(state, handle, fields),
    deleteEntryByHand: (handle) => {
      fake.entries.delete(handle);
    },
    deleteDefinition: () => {
      fake.definition = null;
      fake.entries.clear();
    },
    files: new Map(),
    addFile: (overrides) => {
      const sequence = next();
      const photo = overrides.kind === "photo";
      const baseName = `${overrides.kind}-${sequence}`;
      const file: FakeFile = {
        id: `gid://shopify/${photo ? "MediaImage" : "Video"}/${sequence}`,
        status: "READY",
        mimeType: photo ? "image/jpeg" : "video/mp4",
        url: `${CDN}/${baseName}.${photo ? "jpg" : "mp4"}?v=1`,
        sources: [],
        previewUrl: photo ? null : `${CDN}/${baseName}-preview.jpg?v=1`,
        errorCode: null,
        alt: null,
        ...overrides,
      };

      fake.files.set(file.id, file);

      return file;
    },
    setFile: (id, patch) => {
      const file = fake.files.get(id);

      if (!file) {
        throw new Error(`The fake has no file ${id}.`);
      }

      Object.assign(file, patch);
    },
    removeFile: (id) => {
      fake.files.delete(id);
    },
    products,
    addProduct: (overrides = {}) => {
      const sequence = next();
      const product: FakeProduct = {
        id: `gid://shopify/Product/${80000000 + sequence}`,
        title: `Test product ${sequence}`,
        status: "ACTIVE",
        imageUrl: `${CDN}/product-${sequence}.jpg?v=1`,
        ...overrides,
      };

      fake.products.set(product.id, product);
      state.removedProducts.delete(product.id);

      return product;
    },
    removeProduct: (id) => {
      fake.products.delete(id);
      state.removedProducts.add(id);
    },
    orders,
    shop: {
      name: "Iconic Shirts Test",
      ianaTimezone: "Europe/London",
      orderNumberFormatPrefix: "#",
      orderNumberFormatSuffix: "",
      ...seed.shop,
    },
    legacyMetafield: seed.legacy
      ? { jsonValue: seed.legacy, updatedAt: "2026-09-20T09:00:00Z" }
      : null,
    throttleStatus: {
      maximumAvailable: 2000,
      currentlyAvailable: 1990,
      restoreRate: 100,
    },
  };

  const state: State = {
    fake,
    definitionType: COA_TYPE,
    removedProducts: new Set(),
    next,
  };

  const graphql = async (
    query: string,
    options?: { variables?: Variables; signal?: AbortSignal },
  ): Promise<Response> => {
    const operation = OPERATION_NAME.exec(query)?.[1];

    if (!operation) {
      throw new Error("The fake Admin API answers named Coa operations only.");
    }

    // Variables reach Shopify as JSON: a key set to undefined is not sent at all.
    const variables = JSON.parse(
      JSON.stringify(options?.variables ?? {}),
    ) as Variables;

    fake.calls.push({ operation, variables });

    if (options?.signal?.aborted) {
      throw options.signal.reason;
    }

    const handler = HANDLERS[operation];

    if (!handler) {
      throw new Error(`The fake Admin API doesn't implement ${operation}.`);
    }

    const failure = failures.get(operation)?.shift();

    if (!failure) {
      return respond(fake, handler(state, variables));
    }

    if ("userError" in failure) {
      const { code, message, field, elementKey } = failure.userError;

      return respond(
        fake,
        userErrorData(operation, {
          code,
          message: message ?? code,
          field: field ?? null,
          elementKey: elementKey ?? null,
        }),
      );
    }

    if ("throwResponse" in failure) {
      throw new Response("", { status: failure.throwResponse });
    }

    if ("applyThenThrow" in failure) {
      handler(state, variables);

      throw thrownError(failure.applyThenThrow);
    }

    throw thrownError(failure.throw, failure.message);
  };

  fake.client.graphql = graphql as unknown as AdminClient["graphql"];

  return fake;
}
