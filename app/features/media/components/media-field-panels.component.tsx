import { useEffect, useRef } from "react";
import type { MediaFieldActions } from "~/features/media/types/media-field.types";
import {
  fieldIdOf,
  MEDIA_FIELD_COPY,
  type PickView,
} from "~/features/media/utils/media-field-view.utils";
import { MEDIA_MESSAGES } from "~/features/media/utils/media.utils";
import type { MediaKind } from "~/features/media/types/media.types";
import { useDomEvent } from "~/shared/hooks/use-dom-event.hook";
import { ServerError } from "./media-preview.component";

export function PickPanel({
  kind,
  view,
  pickerAvailable,
  actions,
}: {
  kind: MediaKind;
  view: PickView;
  pickerAvailable: boolean;
  actions: MediaFieldActions;
}) {
  const copy = MEDIA_FIELD_COPY[kind];

  return (
    <s-stack gap="small">
      <s-clickable
        id={fieldIdOf(kind)}
        accessibilityLabel={copy.buttonLabels.pick}
        disabled={!pickerAvailable || undefined}
        border="base"
        borderStyle="dashed"
        borderRadius="base"
        padding="large"
        onClick={actions.pick}
      >
        <s-stack gap="small-200" alignItems="center">
          <s-icon type={kind === "photo" ? "image-add" : "video"} />
          <s-text type="strong">{copy.pickTitle}</s-text>
          <s-text color="subdued">
            {pickerAvailable ? copy.pickHint : MEDIA_MESSAGES.pickerUnavailable}
          </s-text>
        </s-stack>
      </s-clickable>
      <ServerError message={view.error} />
      <s-stack direction="inline" gap="small">
        <s-button
          variant="tertiary"
          accessibilityLabel={copy.buttonLabels.addFromUrl}
          onClick={actions.openUrl}
        >
          Add from URL
        </s-button>
        {view.restorable && (
          <s-button
            variant="tertiary"
            accessibilityLabel={copy.buttonLabels.cancelReplace}
            onClick={actions.showCurrent}
          >
            Cancel
          </s-button>
        )}
      </s-stack>
    </s-stack>
  );
}

export function BusyLine({
  label,
  details,
}: {
  label: string;
  details?: string;
}) {
  return (
    <s-stack gap="small">
      <s-stack direction="inline" gap="small" alignItems="center">
        <s-spinner size="base" accessibilityLabel={label} />
        <s-text>{label}</s-text>
      </s-stack>
      {details && <s-text color="subdued">{details}</s-text>}
    </s-stack>
  );
}

export function UrlPanel({
  kind,
  checking,
  error,
  actions,
}: {
  kind: MediaKind;
  checking: boolean;
  error: string | null;
  actions: MediaFieldActions;
}) {
  const fieldRef = useRef<HTMLElementTagNameMap["s-url-field"]>(null);
  const copy = MEDIA_FIELD_COPY[kind];
  const add = () => actions.addUrl(fieldRef.current?.value ?? "");

  useDomEvent(fieldRef, "keydown", (event) => {
    if (
      event instanceof KeyboardEvent &&
      event.key === "Enter" &&
      !event.isComposing
    ) {
      event.preventDefault();
      add();
    }
  });

  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  return (
    <s-grid gridTemplateColumns="1fr auto auto" alignItems="end" gap="small">
      <s-url-field
        ref={fieldRef}
        label={copy.urlLabel}
        placeholder="https://"
        error={error ?? undefined}
        onInput={actions.editUrl}
      />
      <s-button
        loading={checking || undefined}
        accessibilityLabel={copy.buttonLabels.addUrl}
        onClick={add}
      >
        Add
      </s-button>
      <s-button
        variant="tertiary"
        accessibilityLabel={copy.buttonLabels.cancelUrl}
        onClick={actions.showCurrent}
      >
        Cancel
      </s-button>
    </s-grid>
  );
}
