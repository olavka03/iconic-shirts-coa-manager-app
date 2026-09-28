import type { AdminClient } from "~/.server/gateways/admin-graphql.gateway";
import {
  addDefinitionFields,
  createDefinition,
  getDefinition,
  type UserErrorResult,
} from "~/.server/gateways/metaobjects.gateway";
import { log } from "~/.server/logging/logger.service";
import { MirrorError, throwIfFailed } from "./mirror-errors.utils";
import { DEFINITION_INPUT, diffDefinition } from "./mirror-values.utils";

type StoredDefinition = NonNullable<Awaited<ReturnType<typeof getDefinition>>>;

const DEFINITION_TTL_MS = 10 * 60_000;

const definitionMemo = new Map<
  string,
  { startedAt: number; promise: Promise<void> }
>();

export function clearDefinitionMemo(): void {
  definitionMemo.clear();
}

export function ensureDefinition(
  admin: AdminClient,
  shop: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  const cached = definitionMemo.get(shop);

  if (
    !options.force &&
    cached &&
    Date.now() - cached.startedAt < DEFINITION_TTL_MS
  ) {
    return cached.promise;
  }

  const promise = readOrCreateDefinition(admin, shop, options.signal);

  definitionMemo.set(shop, { startedAt: Date.now(), promise });
  promise.catch(() => {
    if (definitionMemo.get(shop)?.promise === promise) {
      definitionMemo.delete(shop);
    }
  });

  return promise;
}

async function readOrCreateDefinition(
  admin: AdminClient,
  shop: string,
  signal?: AbortSignal,
): Promise<void> {
  const existing =
    (await getDefinition(admin, { signal })) ??
    (await createOrReread(admin, signal));

  if (existing) {
    await addMissingFields(admin, shop, existing, signal);
  }
}

// Null when the definition was just created with every field.
async function createOrReread(
  admin: AdminClient,
  signal?: AbortSignal,
): Promise<StoredDefinition | null> {
  const created = await createDefinition(admin, DEFINITION_INPUT, { signal });

  if (created.ok) {
    return null;
  }

  if (created.code !== "TAKEN") {
    throw new MirrorError(created.code, created.message);
  }

  // Another process created it between our read and our create.
  const definition = await getDefinition(admin, { signal });

  if (!definition) {
    throw new MirrorError(
      "TAKEN",
      "The definition was reported as taken but can't be read.",
    );
  }

  return definition;
}

async function addMissingFields(
  admin: AdminClient,
  shop: string,
  definition: StoredDefinition,
  signal?: AbortSignal,
): Promise<void> {
  const { create, conflicts } = diffDefinition(definition.fields);

  for (const conflict of conflicts) {
    log.warn("mirror.definition_conflict", { shop, ...conflict });
  }

  if (create.length === 0) {
    return;
  }

  const result = await addDefinitionFields(admin, definition.id, create, {
    signal,
  });

  throwIfFailed(result);
}

export const isDefinitionError = (error: UserErrorResult) =>
  error.code === "UNDEFINED_OBJECT_TYPE" ||
  error.code === "UNDEFINED_OBJECT_FIELD";
