import type { FieldErrors } from "~/shared/types/api.types";

// With one or two signers the rows stay under each other; from three on, one signer shows at a time.
export const CAROUSEL_MIN_SIGNERS = 3;

// The key follows a signer that moves; the index is the fallback once that signer is gone or not known yet.
export type CarouselPosition = { key: string | null; index: number };

const SIGNER_ERROR = /^signers\.(\d+)\./;

export function usesCarousel(count: number): boolean {
  return count >= CAROUSEL_MIN_SIGNERS;
}

export function currentSignerIndex(
  keys: readonly string[],
  position: CarouselPosition,
): number {
  const byKey = position.key === null ? -1 : keys.indexOf(position.key);

  if (byKey !== -1) {
    return byKey;
  }

  return Math.min(Math.max(position.index, 0), Math.max(keys.length - 1, 0));
}

export function invalidSignerIndexes(errors: FieldErrors): Set<number> {
  const indexes = Object.keys(errors).flatMap((path) => {
    const match = SIGNER_ERROR.exec(path);

    return match ? [Number(match[1])] : [];
  });

  return new Set(indexes);
}

export function firstInvalidSigner(errors: FieldErrors): number | null {
  const indexes = [...invalidSignerIndexes(errors)];

  return indexes.length === 0 ? null : Math.min(...indexes);
}
