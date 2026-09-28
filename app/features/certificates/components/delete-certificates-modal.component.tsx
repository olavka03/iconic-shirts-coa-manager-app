import { useRef, useState } from "react";
import { useDomEvent } from "~/shared/hooks/use-dom-event.hook";
import { joinWithAnd, pluralize } from "~/shared/utils/format.utils";

type ModalId = "bulk-delete-modal" | "delete-certificate-modal";

export type DeleteModalCopy = { heading: string; body: string; action: string };

type DeleteCertificatesModalProps = {
  id: ModalId;
  codes: string[];
  onConfirm: () => Promise<boolean>;
  onDeleted: () => void;
};

const FAILURE_MESSAGES: Record<ModalId, string> = {
  "delete-certificate-modal": "The certificate couldn't be deleted. Try again.",
  "bulk-delete-modal": "The certificates couldn't be deleted. Try again.",
};

const LISTED_CODES = 3;

function listCodes(codes: string[]): string {
  const others = codes.length - LISTED_CODES;

  if (others <= 0) {
    return joinWithAnd(codes);
  }

  return joinWithAnd([
    ...codes.slice(0, LISTED_CODES),
    pluralize(others, "other code"),
  ]);
}

export function deleteModalCopy(codes: string[]): DeleteModalCopy {
  const count = codes.length;

  if (count === 1) {
    return {
      heading: `Delete ${codes[0]}?`,
      body: "Customers won't be able to verify this code on your verification page anymore. This can't be undone.",
      action: "Delete certificate",
    };
  }

  return {
    heading: `Delete ${count} certificates?`,
    body: `Customers won't be able to verify ${listCodes(codes)} anymore. This can't be undone.`,
    action: `Delete ${count} certificates`,
  };
}

// The index clears its selection while the modal is still closing, so the modal keeps showing the codes it
// was opened with instead of collapsing mid-animation.
function useLastNonEmpty(codes: string[]): string[] {
  const [last, setLast] = useState(codes);

  if (codes.length > 0 && codes.join("\n") !== last.join("\n")) {
    setLast(codes);
  }

  return codes.length > 0 ? codes : last;
}

export function DeleteCertificatesModal({
  id,
  codes,
  onConfirm,
  onDeleted,
}: DeleteCertificatesModalProps) {
  const modalRef = useRef<HTMLElementTagNameMap["s-modal"]>(null);
  const confirmRef = useRef<HTMLElementTagNameMap["s-button"]>(null);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const shownCodes = useLastNonEmpty(codes);
  const copy = shownCodes.length > 0 ? deleteModalCopy(shownCodes) : null;

  useDomEvent(modalRef, "aftershow", () => confirmRef.current?.focus());
  useDomEvent(modalRef, "afterhide", () => setFailed(false));

  async function confirm() {
    if (deleting) {
      return;
    }

    setDeleting(true);
    setFailed(false);
    const deleted = await onConfirm();
    setDeleting(false);

    if (!deleted) {
      setFailed(true);

      return;
    }

    modalRef.current?.hideOverlay();
    onDeleted();
  }

  return (
    <s-modal ref={modalRef} id={id} heading={copy?.heading}>
      {copy ? <s-paragraph>{copy.body}</s-paragraph> : null}
      {failed ? (
        <s-banner tone="critical">{FAILURE_MESSAGES[id]}</s-banner>
      ) : null}
      <s-button
        ref={confirmRef}
        slot="primary-action"
        variant="primary"
        tone="critical"
        loading={deleting || undefined}
        onClick={() => void confirm()}
      >
        {copy?.action}
      </s-button>
      <s-button slot="secondary-actions" commandFor={id} command="--hide">
        Cancel
      </s-button>
    </s-modal>
  );
}
