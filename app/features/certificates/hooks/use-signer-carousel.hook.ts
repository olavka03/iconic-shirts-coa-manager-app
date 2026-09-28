import { useEffect, useRef, useState } from "react";
import type { SignerDraft } from "~/features/certificates/types/certificate-form.types";
import {
  currentSignerIndex,
  firstInvalidSigner,
  type CarouselPosition,
} from "~/features/certificates/utils/signer-carousel.utils";
import type { FieldErrors } from "~/shared/types/api.types";
import { useLatest } from "~/shared/hooks/use-latest.hook";

export type SignerCarousel = {
  index: number;
  show(index: number): void;
  showAdded(): void;
};

export function useSignerCarousel(
  signers: SignerDraft[],
  errors: FieldErrors,
  failedSaves: number,
): SignerCarousel {
  const keys = signers.map((signer) => signer.key);
  const [position, setPosition] = useState<CarouselPosition>({
    key: keys[0] ?? null,
    index: 0,
  });
  // A removed signer's place goes to its neighbour, so the fallback is the index shown last.
  const lastIndex = useRef(position.index);
  const index = currentSignerIndex(
    keys,
    position.key === null
      ? position
      : { key: position.key, index: lastIndex.current },
  );
  const shownKey = keys[index];

  useEffect(() => {
    lastIndex.current = index;
  });
  const latest = useLatest({ keys, errors });
  const seenFailures = useRef(failedSaves);

  // Once an added signer exists, its key is remembered, so it stays shown when it moves.
  useEffect(() => {
    if (position.key === null && shownKey !== undefined) {
      setPosition({ key: shownKey, index });
    }
  }, [position.key, shownKey, index]);

  // A failed save opens the first signer with an error.
  useEffect(() => {
    if (failedSaves === seenFailures.current) {
      return;
    }

    seenFailures.current = failedSaves;

    const invalid = firstInvalidSigner(latest.current.errors);

    if (invalid !== null) {
      setPosition({
        key: latest.current.keys[invalid] ?? null,
        index: invalid,
      });
    }
  }, [failedSaves, latest]);

  return {
    index,
    show: (index) => setPosition({ key: keys[index] ?? null, index }),
    // A new signer is added at the end; its key is known only after the update.
    showAdded: () => setPosition({ key: null, index: keys.length }),
  };
}
