import { useRef, useState, type Dispatch } from "react";
import { formReducer } from "~/features/certificates/reducers/certificate-form.reducer";
import type {
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { clientErrors } from "~/features/certificates/utils/certificate-form-errors.utils";
import {
  projection,
  toInput,
} from "~/features/certificates/utils/certificate-form-input.utils";
import { orderNumericId } from "~/features/orders/utils/orders.utils";
import { fetchOrderDetail } from "~/features/orders/utils/order-requests.utils";
import { beginLoading } from "~/shared/utils/admin-loading.utils";
import {
  isNetworkFailure,
  requestJson,
  type NetworkFailure,
} from "~/shared/utils/json-request.utils";
import { useLatest } from "~/shared/hooks/use-latest.hook";
import type {
  CertificateDetail,
  CreateResponse,
  UpdateResponse,
} from "~/features/certificates/types/certificates.types";
import type { ErrorBody, FieldErrors } from "~/shared/types/api.types";

export type SaveFailure = "unavailable" | "not_found";
type SaveOutcome =
  | { kind: "created"; id: string }
  | { kind: "updated"; certificate: CertificateDetail }
  | { kind: "rejected"; fieldErrors: FieldErrors }
  | { kind: "failed"; reason: SaveFailure };
type SaveCallbacks = {
  onCreated(id: string): void;
  onUpdated(certificate: CertificateDetail, sentProjection: string): void;
};

function failureOutcome(body: ErrorBody | NetworkFailure): SaveOutcome {
  if (isNetworkFailure(body)) {
    return { kind: "failed", reason: "unavailable" };
  }

  if (body.fieldErrors !== undefined) {
    return { kind: "rejected", fieldErrors: body.fieldErrors };
  }

  return {
    kind: "failed",
    reason: body.formError === "not_found" ? "not_found" : "unavailable",
  };
}

async function sendDraft(state: FormState): Promise<SaveOutcome> {
  const values = toInput(state).input;

  if (state.certificateId === null) {
    const created = await requestJson<CreateResponse>("/api/certificates", {
      body: { intent: "create", values },
    });

    return created.ok
      ? { kind: "created", id: created.id }
      : failureOutcome(created);
  }

  const updated = await requestJson<UpdateResponse>(
    `/api/certificates/${state.certificateId}`,
    { body: { intent: "update", values } },
  );

  return updated.ok
    ? { kind: "updated", certificate: updated.certificate }
    : failureOutcome(updated);
}

function isAutoCodeConflict(
  state: FormState,
  fieldErrors: FieldErrors,
): boolean {
  const keys = Object.keys(fieldErrors);

  return (
    state.codeMode === "auto" &&
    !state.autoRetried &&
    keys.length === 1 &&
    keys[0] === "code"
  );
}

async function freshTakenCodes(state: FormState): Promise<string[] | null> {
  const orderId = state.draft.order?.id;
  const numericId = orderId ? orderNumericId(orderId) : null;

  if (numericId === null) {
    return null;
  }

  const result = await fetchOrderDetail(numericId, state.certificateId);

  return result.ok && result.detail !== null ? result.detail.takenCodes : null;
}

export function useCertificateSave(
  state: FormState,
  dispatch: Dispatch<FormAction>,
  callbacks: SaveCallbacks,
) {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [failedSaves, setFailedSaves] = useState(0);
  const latestState = useLatest(state);
  const requestPending = useRef(false);

  const showErrors = (errors: FieldErrors) => {
    dispatch({ type: "serverErrors", errors });
    setFailedSaves((count) => count + 1);
  };

  const submit = async (sent: FormState): Promise<void> => {
    const sentProjection = projection(sent.draft);
    const outcome = await sendDraft(sent);

    switch (outcome.kind) {
      case "created":
        callbacks.onCreated(outcome.id);

        return;
      case "updated":
        callbacks.onUpdated(outcome.certificate, sentProjection);

        return;
      case "failed":
        setFailure(outcome.reason);

        return;
      case "rejected": {
        if (!isAutoCodeConflict(sent, outcome.fieldErrors)) {
          showErrors(outcome.fieldErrors);

          return;
        }

        const rejectedAction: FormAction = {
          type: "autoCodeRejected",
          takenCodes: await freshTakenCodes(sent),
          rejected: toInput(sent).input.code,
          message: outcome.fieldErrors.code,
        };
        // dispatch is asynchronous, so the retry sends the state the reducer is about to hold.
        const retried = formReducer(latestState.current, rejectedAction);

        dispatch(rejectedAction);
        await submit(retried);
      }
    }
  };

  const save = async () => {
    if (requestPending.current) {
      return;
    }

    setFailure(null);
    dispatch({ type: "validate" });

    if (Object.keys(clientErrors(state)).length > 0) {
      setFailedSaves((count) => count + 1);

      return;
    }

    requestPending.current = true;
    setSaving(true);
    const endLoading = beginLoading();

    try {
      await submit(state);
    } finally {
      endLoading();
      requestPending.current = false;
      setSaving(false);
    }
  };

  return {
    saving,
    failure,
    failedSaves,
    save,
    clearFailure: () => setFailure(null),
  };
}
