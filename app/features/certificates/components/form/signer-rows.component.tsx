import { Fragment } from "react";
import type {
  SectionProps,
  SignerFocus,
} from "~/features/certificates/types/certificate-form.types";
import { sharedOverridesOthers } from "~/features/certificates/utils/certificate-form-draft.utils";
import { toInput } from "~/features/certificates/utils/certificate-form-input.utils";
import {
  signerErrors,
  type SignerActions,
} from "~/features/certificates/utils/signer-actions.utils";
import {
  DateAndLocationFields,
  NameField,
  SignerMenu,
} from "./signer-fields.component";

const SIGNER_ROW_COLUMNS =
  "@container (inline-size > 640px) 2fr 1.5fr 2fr, 1fr";
const SHARED_FIELDS_COLUMNS = "@container (inline-size > 640px) 1fr 1fr, 1fr";

export type RowsProps = SectionProps & {
  focus: SignerFocus;
  actions: SignerActions;
};

export function OneSigner({ state, dispatch, focus }: RowsProps) {
  const [signer] = state.draft.signers;
  const errors = signerErrors(state, 0);

  return (
    <s-query-container>
      <s-grid
        gap="base"
        alignItems="start"
        gridTemplateColumns={SIGNER_ROW_COLUMNS}
      >
        <NameField
          signer={signer}
          label="Name"
          error={errors.name}
          dispatch={dispatch}
          focus={focus}
        />
        <DateAndLocationFields
          target={{ scope: "signer", signerKey: signer.key }}
          fieldIdKey={signer.key}
          value={signer.own}
          errors={errors}
          dispatch={dispatch}
        />
      </s-grid>
    </s-query-container>
  );
}

type SignerRowProps = RowsProps & { index: number };

// The shared inputs carry the errors and ids of the first signer that will be saved.
export function SharedFields({ state, dispatch }: RowsProps) {
  const { draft } = state;
  const [sharedKey] = toInput(state).rowKeys;
  const sharedIndex = draft.signers.findIndex(
    (signer) => signer.key === sharedKey,
  );

  return (
    <>
      <s-query-container>
        <s-grid
          gap="base"
          alignItems="start"
          gridTemplateColumns={SHARED_FIELDS_COLUMNS}
        >
          <DateAndLocationFields
            target={{ scope: "shared" }}
            fieldIdKey={sharedKey}
            value={draft.shared}
            errors={signerErrors(state, sharedIndex)}
            dispatch={dispatch}
          />
        </s-grid>
      </s-query-container>
      {sharedOverridesOthers(draft) && (
        <s-banner tone="warning">
          <s-paragraph>
            Saving will use signer 1&apos;s date and location for all{" "}
            {draft.signers.length} signers.
          </s-paragraph>
        </s-banner>
      )}
    </>
  );
}

export function SharedNameRow({
  state,
  dispatch,
  focus,
  actions,
  index,
}: SignerRowProps) {
  const { signers } = state.draft;
  const signer = signers[index];

  return (
    <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="end">
      <NameField
        signer={signer}
        label={`Signer ${index + 1}`}
        error={signerErrors(state, index).name}
        dispatch={dispatch}
        focus={focus}
      />
      <SignerMenu
        signer={signer}
        index={index}
        count={signers.length}
        focus={focus}
        actions={actions}
      />
    </s-grid>
  );
}

export function SharedSigners(rows: RowsProps) {
  return (
    <>
      <SharedFields {...rows} />
      <s-divider />
      {rows.state.draft.signers.map((signer, index) => (
        <SharedNameRow key={signer.key} {...rows} index={index} />
      ))}
    </>
  );
}

export function SeparateSignerCard({
  state,
  dispatch,
  focus,
  actions,
  index,
}: SignerRowProps) {
  const { signers } = state.draft;
  const signer = signers[index];
  const errors = signerErrors(state, index);

  return (
    <s-stack gap="small">
      <s-grid gridTemplateColumns="1fr auto" alignItems="center">
        <s-text type="strong">Signer {index + 1}</s-text>
        <SignerMenu
          signer={signer}
          index={index}
          count={signers.length}
          focus={focus}
          actions={actions}
        />
      </s-grid>
      <s-query-container>
        <s-grid
          gap="base"
          alignItems="start"
          gridTemplateColumns={SIGNER_ROW_COLUMNS}
        >
          <NameField
            signer={signer}
            label="Name"
            error={errors.name}
            dispatch={dispatch}
            focus={focus}
          />
          <DateAndLocationFields
            target={{ scope: "signer", signerKey: signer.key }}
            fieldIdKey={signer.key}
            value={signer.own}
            errors={errors}
            dispatch={dispatch}
          />
        </s-grid>
      </s-query-container>
    </s-stack>
  );
}

export function SeparateSigners(rows: RowsProps) {
  return (
    <>
      {rows.state.draft.signers.map((signer, index) => (
        <Fragment key={signer.key}>
          {index > 0 && <s-divider />}
          <SeparateSignerCard {...rows} index={index} />
        </Fragment>
      ))}
    </>
  );
}
