import type { ReactNode } from "react";
import type { SignerDraft } from "~/features/certificates/types/certificate-form.types";

type SignerCarouselProps = {
  signers: SignerDraft[];
  index: number;
  invalid: ReadonlySet<number>;
  onStep(index: number): void;
  onJump(index: number): void;
  children: ReactNode;
};

export function SignerCarousel({
  signers,
  index,
  invalid,
  onStep,
  onJump,
  children,
}: SignerCarouselProps) {
  return (
    <s-stack gap="base">
      <s-grid
        gridTemplateColumns="auto 1fr auto"
        gap="small"
        alignItems="center"
      >
        <s-button
          variant="tertiary"
          icon="chevron-left"
          accessibilityLabel="Previous signer"
          disabled={index === 0 || undefined}
          onClick={() => onStep(index - 1)}
        />
        <s-stack alignItems="center">
          <s-text>{`Signer ${index + 1} of ${signers.length}`}</s-text>
        </s-stack>
        <s-button
          variant="tertiary"
          icon="chevron-right"
          accessibilityLabel="Next signer"
          disabled={index === signers.length - 1 || undefined}
          onClick={() => onStep(index + 1)}
        />
      </s-grid>
      {children}
      <s-stack direction="inline" gap="small-200">
        {signers.map((signer, position) => (
          <s-clickable-chip
            key={signer.key}
            color={position === index ? "strong" : "base"}
            onClick={() => onJump(position)}
          >
            {invalid.has(position) && (
              <s-icon slot="graphic" type="alert-circle" tone="critical" />
            )}
            {signer.name.trim() || `Signer ${position + 1}`}
          </s-clickable-chip>
        ))}
      </s-stack>
    </s-stack>
  );
}
