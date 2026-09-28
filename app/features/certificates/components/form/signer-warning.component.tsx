import { useRef } from "react";
import { useDomEvent } from "~/shared/hooks/use-dom-event.hook";
import type { SectionProps } from "~/features/certificates/types/certificate-form.types";
import { signerWarning } from "~/features/certificates/utils/certificate-form-selectors.utils";

export function SignerWarning({ state, dispatch }: SectionProps) {
  const bannerRef = useRef<HTMLElementTagNameMap["s-banner"]>(null);
  const warning = signerWarning(state);

  useDomEvent(bannerRef, "dismiss", () =>
    dispatch({ type: "dismissSignerWarning" }),
  );

  if (warning === null) {
    return null;
  }

  return (
    <s-banner ref={bannerRef} tone="warning" dismissible>
      <s-paragraph>{warning.text}</s-paragraph>
      {warning.useName !== null && (
        <s-button
          slot="secondary-actions"
          onClick={() => dispatch({ type: "acceptHintName" })}
        >
          Use {warning.useName}
        </s-button>
      )}
    </s-banner>
  );
}
