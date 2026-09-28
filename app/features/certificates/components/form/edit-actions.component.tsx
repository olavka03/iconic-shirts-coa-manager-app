import { DELETE_MODAL_ID } from "~/features/certificates/constants/certificate-form.constants";

export function EditActions({ certificateId }: { certificateId: string }) {
  return (
    <>
      <s-button
        slot="secondary-actions"
        href={`/app/certificates/new?duplicate=${certificateId}`}
      >
        Duplicate
      </s-button>
      <s-button
        slot="secondary-actions"
        tone="critical"
        commandFor={DELETE_MODAL_ID}
        command="--show"
      >
        Delete
      </s-button>
    </>
  );
}
