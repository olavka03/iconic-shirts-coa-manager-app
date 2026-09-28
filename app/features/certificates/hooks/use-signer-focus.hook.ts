import { useRef } from "react";
import type {
  SignerDraft,
  SignerFocus,
} from "~/features/certificates/types/certificate-form.types";
import { useLatest } from "~/shared/hooks/use-latest.hook";

export function useSignerFocus(signers: SignerDraft[]): SignerFocus {
  const elements = useRef(new Map<string, HTMLElement>());
  const keys = useLatest(signers.map((signer) => signer.key));

  return {
    register: (target, key) => (element) => {
      const id = `${target}:${key}`;

      if (element !== null) {
        elements.current.set(id, element);
      }

      return () => {
        elements.current.delete(id);
      };
    },
    // polaris.js renders the controls of a new or moved row after React commits, so focus waits a frame.
    focusAfterUpdate: (target, pickKey) => {
      requestAnimationFrame(() => {
        const key = pickKey(keys.current);

        if (key !== undefined) {
          elements.current.get(`${target}:${key}`)?.focus();
        }
      });
    },
  };
}
