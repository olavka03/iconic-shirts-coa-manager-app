import type { Dispatch } from "react";
import { SIGNERS_MAX } from "~/features/certificates/constants/certificate-limits.constants";
import { useSignerCarousel } from "~/features/certificates/hooks/use-signer-carousel.hook";
import { useSignerFocus } from "~/features/certificates/hooks/use-signer-focus.hook";
import { SCHEMA_MESSAGES } from "~/features/certificates/schemas/certificate.schema";
import type {
  FormAction,
  SectionProps,
} from "~/features/certificates/types/certificate-form.types";
import { signerMode } from "~/features/certificates/utils/certificate-form-draft.utils";
import { signerActions } from "~/features/certificates/utils/signer-actions.utils";
import {
  invalidSignerIndexes,
  usesCarousel,
} from "~/features/certificates/utils/signer-carousel.utils";
import { SignerCarousel } from "./signer-carousel.component";
import {
  OneSigner,
  SeparateSignerCard,
  SeparateSigners,
  SharedFields,
  SharedNameRow,
  SharedSigners,
  type RowsProps,
} from "./signer-rows.component";
import { SignerWarning } from "./signer-warning.component";

function SharedToggle({
  on,
  dispatch,
}: {
  on: boolean;
  dispatch: Dispatch<FormAction>;
}) {
  return (
    <s-checkbox
      label="Same date and location for all signers"
      checked={on || undefined}
      onInput={(event) =>
        dispatch({ type: "setSharedOn", on: event.currentTarget.checked })
      }
    />
  );
}

function AddSigner({ count, onAdd }: { count: number; onAdd(): void }) {
  const atLimit = count >= SIGNERS_MAX;

  return (
    <>
      <s-stack direction="inline">
        <s-button
          variant="tertiary"
          icon="plus-circle"
          disabled={atLimit || undefined}
          onClick={onAdd}
        >
          Add signer
        </s-button>
      </s-stack>
      {atLimit && <s-text color="subdued">{SCHEMA_MESSAGES.signersMax}</s-text>}
    </>
  );
}

function SignerRows({
  rows,
  carouselIndex,
  onStep,
  onJump,
}: {
  rows: RowsProps;
  carouselIndex: number;
  onStep(index: number): void;
  onJump(index: number): void;
}) {
  const { draft, errors } = rows.state;
  const mode = signerMode(draft);

  if (mode === "one") {
    return <OneSigner {...rows} />;
  }

  if (!usesCarousel(draft.signers.length)) {
    return mode === "shared" ? (
      <SharedSigners {...rows} />
    ) : (
      <SeparateSigners {...rows} />
    );
  }

  const carousel = (
    <SignerCarousel
      signers={draft.signers}
      index={carouselIndex}
      invalid={invalidSignerIndexes(errors)}
      onStep={onStep}
      onJump={onJump}
    >
      {mode === "shared" ? (
        <SharedNameRow {...rows} index={carouselIndex} />
      ) : (
        <SeparateSignerCard {...rows} index={carouselIndex} />
      )}
    </SignerCarousel>
  );

  return mode === "shared" ? (
    <>
      <SharedFields {...rows} />
      <s-divider />
      {carousel}
    </>
  ) : (
    carousel
  );
}

export function SignersSection({
  state,
  dispatch,
  failedSaves = 0,
}: SectionProps & { failedSaves?: number }) {
  const { draft } = state;
  const mode = signerMode(draft);
  const focus = useSignerFocus(draft.signers);
  const carousel = useSignerCarousel(draft.signers, state.errors, failedSaves);
  const baseActions = signerActions(draft, dispatch, focus);
  const actions = {
    ...baseActions,
    add: () => {
      carousel.showAdded();
      baseActions.add();
    },
  };
  const rows: RowsProps = { state, dispatch, focus, actions };

  // The checkbox keeps its place between the shared and separate modes, so focus stays on it.
  return (
    <s-stack gap="base">
      <SignerWarning state={state} dispatch={dispatch} />
      {mode !== "one" && (
        <SharedToggle on={mode === "shared"} dispatch={dispatch} />
      )}
      <SignerRows
        rows={rows}
        carouselIndex={carousel.index}
        onStep={carousel.show}
        onJump={(index) => {
          carousel.show(index);
          focus.focusAfterUpdate("name", (keys) => keys[index]);
        }}
      />
      <AddSigner count={draft.signers.length} onAdd={actions.add} />
    </s-stack>
  );
}
