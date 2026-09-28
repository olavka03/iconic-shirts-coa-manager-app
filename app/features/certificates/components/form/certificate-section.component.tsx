import type { CodeCheck } from "~/features/codes/hooks/use-code-check.hook";
import { ITEM_MAX } from "~/features/certificates/constants/certificate-limits.constants";
import { CodeField } from "./code-field.component";
import { fieldError } from "~/features/certificates/utils/field-labels.utils";
import type { SectionProps } from "~/features/certificates/types/certificate-form.types";
import { LinkedProduct } from "./linked-product.component";
import { OrderCertificates } from "~/features/orders/components/order-certificates.component";

type CertificateSectionProps = SectionProps & {
  codeCheck: CodeCheck;
  onNavigate(href: string): void;
  duplicateOf: { code: string } | null;
};

function ItemField({ state, dispatch }: SectionProps) {
  return (
    <s-text-field
      id="certificate-item"
      label="Item"
      required
      maxLength={ITEM_MAX}
      value={state.draft.item}
      error={fieldError(state.errors, "item")}
      onInput={(event) =>
        dispatch({ type: "setItem", value: event.currentTarget.value })
      }
    />
  );
}

export function CertificateSection({
  state,
  dispatch,
  codeCheck,
  onNavigate,
  duplicateOf,
}: CertificateSectionProps) {
  return (
    <s-section
      heading="Certificate"
      subheading={duplicateOf ? `Copied from ${duplicateOf.code}` : undefined}
    >
      <s-stack gap="base">
        <s-stack gap="small-200">
          <CodeField
            state={state}
            dispatch={dispatch}
            codeCheck={codeCheck}
            onNavigate={onNavigate}
          />
          <OrderCertificates
            certificates={state.draft.orderCertificates}
            orderName={state.draft.order?.name ?? null}
            onNavigate={onNavigate}
          />
        </s-stack>
        <ItemField state={state} dispatch={dispatch} />
        <LinkedProduct state={state} dispatch={dispatch} />
      </s-stack>
    </s-section>
  );
}
