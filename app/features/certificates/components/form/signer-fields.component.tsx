import type { Dispatch } from "react";
import {
  LOCATION_MAX,
  SIGNER_NAME_MAX,
} from "~/features/certificates/constants/certificate-limits.constants";
import type {
  DateAndLocation,
  DateAndLocationTarget,
  FormAction,
  SignerDraft,
  SignerFocus,
} from "~/features/certificates/types/certificate-form.types";
import type {
  SignerActions,
  SignerErrors,
} from "~/features/certificates/utils/signer-actions.utils";
import { DateSignedInput } from "./date-signed-input.component";

type NameFieldProps = {
  signer: SignerDraft;
  label: string;
  error: string | undefined;
  dispatch: Dispatch<FormAction>;
  focus: SignerFocus;
};

export function NameField({
  signer,
  label,
  error,
  dispatch,
  focus,
}: NameFieldProps) {
  return (
    <s-text-field
      id={`signer-name-${signer.key}`}
      ref={focus.register("name", signer.key)}
      label={label}
      required
      autocomplete="off"
      maxLength={SIGNER_NAME_MAX}
      value={signer.name}
      error={error}
      onInput={(event) =>
        dispatch({
          type: "setSignerName",
          key: signer.key,
          value: event.currentTarget.value,
        })
      }
    />
  );
}

type DateAndLocationFieldsProps = {
  target: DateAndLocationTarget;
  fieldIdKey: string;
  value: DateAndLocation;
  errors: SignerErrors;
  dispatch: Dispatch<FormAction>;
};

export function DateAndLocationFields({
  target,
  fieldIdKey,
  value,
  errors,
  dispatch,
}: DateAndLocationFieldsProps) {
  return (
    <>
      <DateSignedInput
        signerKey={fieldIdKey}
        value={value.date}
        onChange={(date) => dispatch({ type: "setDate", target, value: date })}
        error={errors.date}
        monthError={errors.month}
        yearError={errors.year}
      />
      <s-text-field
        id={`signer-location-${fieldIdKey}`}
        label="Location"
        placeholder="City, country"
        maxLength={LOCATION_MAX}
        value={value.location}
        error={errors.location}
        onInput={(event) =>
          dispatch({
            type: "setLocation",
            target,
            value: event.currentTarget.value,
          })
        }
      />
    </>
  );
}

type SignerMenuProps = {
  signer: SignerDraft;
  index: number;
  count: number;
  focus: SignerFocus;
  actions: SignerActions;
};

export function SignerMenu({
  signer,
  index,
  count,
  focus,
  actions,
}: SignerMenuProps) {
  const position = index + 1;
  const menuId = `signer-menu-${signer.key}`;
  const tooltipId = `signer-menu-tip-${signer.key}`;

  return (
    <s-box>
      <s-button
        ref={focus.register("menu", signer.key)}
        icon="menu-horizontal"
        variant="tertiary"
        accessibilityLabel={`Actions for signer ${position}`}
        commandFor={menuId}
        interestFor={tooltipId}
      />
      <s-tooltip id={tooltipId}>Actions</s-tooltip>
      <s-menu id={menuId} accessibilityLabel={`Signer ${position} actions`}>
        <s-button
          icon="arrow-up"
          disabled={index === 0 || undefined}
          onClick={() => actions.move(signer.key, -1)}
        >
          Move up
        </s-button>
        <s-button
          icon="arrow-down"
          disabled={index === count - 1 || undefined}
          onClick={() => actions.move(signer.key, 1)}
        >
          Move down
        </s-button>
        <s-button
          icon="delete"
          tone="critical"
          onClick={() => actions.remove(index)}
        >
          Remove signer
        </s-button>
      </s-menu>
    </s-box>
  );
}
