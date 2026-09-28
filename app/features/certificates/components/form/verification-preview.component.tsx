import { Fragment } from "react";
import { composeLegacyText } from "~/features/signers/utils/signer-text.utils";
import type {
  CertificateFormInput,
  Draft,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { toInput } from "~/features/certificates/utils/certificate-form-input.utils";
import { proofLabel } from "~/features/certificates/utils/proof-label.utils";

type VerificationPreviewProps = {
  state: FormState;
  createdLabel: string | null;
  updatedLabel: string | null;
};

function previewRows(
  input: CertificateFormInput,
  draft: Draft,
): [string, string][] {
  const composed = composeLegacyText(input.signers);
  const rows: [string, string][] = [
    ["Signed by", composed.signed],
    ["Item", input.item],
    ["Date signed", composed.date],
    ["Location", composed.location],
    // A file that is still processing counts as present, as in the index's Proof column.
    ["Proof", proofLabel(draft.photo !== null, draft.video !== null)],
    ["Notes", input.notes],
  ];

  return rows.filter(([, value]) => value !== "");
}

export function VerificationPreview({
  state,
  createdLabel,
  updatedLabel,
}: VerificationPreviewProps) {
  const { input } = toInput(state);
  const nothingEntered =
    input.item === "" && input.signers.every((signer) => signer.name === "");

  return (
    <s-section
      heading="Preview"
      subheading="What customers see when they check this code."
    >
      <s-stack gap="small">
        <s-heading>{input.code || "Certificate code"}</s-heading>
        {nothingEntered ? (
          <s-text color="subdued">Details you add appear here.</s-text>
        ) : (
          <s-grid gridTemplateColumns="auto 1fr" gap="small-200 base">
            {previewRows(input, state.draft).map(([label, value]) => (
              <Fragment key={label}>
                <s-text color="subdued">{label}</s-text>
                <s-text>{value}</s-text>
              </Fragment>
            ))}
          </s-grid>
        )}
        {createdLabel !== null && updatedLabel !== null && (
          <>
            <s-divider />
            <s-text color="subdued">
              Created {createdLabel} · Last updated {updatedLabel}
            </s-text>
          </>
        )}
      </s-stack>
    </s-section>
  );
}
