import type { Dispatch } from "react";
import type {
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { fieldError } from "~/features/certificates/utils/field-labels.utils";
import { MediaField } from "~/features/media/components/media-field.component";
import type { MediaKind } from "~/features/media/types/media.types";
import { MEDIA_KINDS } from "~/features/media/utils/media.utils";

const MEDIA_HEADINGS: Record<MediaKind, string> = {
  photo: "Photo",
  video: "Video",
};

type ProofSectionProps = {
  state: FormState;
  dispatch: Dispatch<FormAction>;
  discardToken: number;
  onBusyChange(kind: MediaKind, busy: boolean): void;
};

export function ProofSection({
  state,
  dispatch,
  discardToken,
  onBusyChange,
}: ProofSectionProps) {
  return (
    <s-section heading="Proof">
      <s-query-container>
        <s-grid
          gap="large"
          gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr, 1fr"
        >
          {MEDIA_KINDS.map((kind) => (
            <s-stack key={kind} id={`proof-${kind}`} gap="small">
              <s-heading>{MEDIA_HEADINGS[kind]}</s-heading>
              <MediaField
                kind={kind}
                value={state.draft[kind]}
                serverError={fieldError(state.errors, kind) ?? null}
                onChange={(value) =>
                  dispatch({ type: "setMedia", kind, value })
                }
                onBusyChange={(busy) => onBusyChange(kind, busy)}
                discardToken={discardToken}
              />
            </s-stack>
          ))}
        </s-grid>
      </s-query-container>
    </s-section>
  );
}
