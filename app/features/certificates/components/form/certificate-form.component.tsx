import { useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { DeleteCertificatesModal } from "~/features/certificates/components/delete-certificates-modal.component";
import { DELETE_MODAL_ID } from "~/features/certificates/constants/certificate-form.constants";
import { useCertificateSave } from "~/features/certificates/hooks/use-certificate-save.hook";
import { useCodeSuggestion } from "~/features/certificates/hooks/use-code-suggestion.hook";
import {
  useFocusAfterPick,
  useInitialFocus,
} from "~/features/certificates/hooks/use-form-focus.hook";
import { useLastIndexHref } from "~/features/certificates/hooks/use-last-index-search.hook";
import { useMediaCompletion } from "~/features/certificates/hooks/use-media-completion.hook";
import { formReducer } from "~/features/certificates/reducers/certificate-form.reducer";
import type { CertificateFormProps } from "~/features/certificates/types/certificate-form.types";
import { isDirty } from "~/features/certificates/utils/certificate-form-input.utils";
import {
  NOT_BUSY,
  createInitialState,
  discardTarget,
  hasUploadOutsideDraft,
  pageHeading,
} from "~/features/certificates/utils/certificate-form-page.utils";
import { filledLine } from "~/features/certificates/utils/certificate-form-selectors.utils";
import { fieldError } from "~/features/certificates/utils/field-labels.utils";
import { useCodeCheck } from "~/features/codes/hooks/use-code-check.hook";
import {
  OrderPicker,
  type OrderPickerHandle,
} from "~/features/orders/components/order-picker.component";
import { OrderSection } from "~/features/orders/components/order-section.component";
import type { OrderPick } from "~/features/orders/types/order-picker.types";
import { useAdminLoading } from "~/shared/hooks/use-admin-loading.hook";
import { requestJson } from "~/shared/utils/json-request.utils";
import { opensElsewhere } from "~/shared/components/in-app-link.component";
import { useLeaveConfirmation } from "~/shared/hooks/use-leave-confirmation.hook";
import type { DeleteOneResponse } from "~/features/certificates/types/certificates.types";
import { CertificateSection } from "./certificate-section.component";
import { EditActions } from "./edit-actions.component";
import { FormStatusBanner, MediaFailureBanner } from "./form-banners.component";
import { FormSaveBar, hideFormSaveBar } from "./form-save-bar.component";
import { NotesSection } from "./notes-section.component";
import { ProofSection } from "./proof-section.component";
import { SignersSection } from "./signers-section.component";
import { VerificationPreview } from "./verification-preview.component";

export function CertificateForm(props: CertificateFormProps) {
  const navigate = useNavigate();
  const lastIndexHref = useLastIndexHref();
  const [state, dispatch] = useReducer(formReducer, props, createInitialState);
  const [savedCertificate, setSavedCertificate] = useState(
    props.kind === "edit" ? props.certificate : null,
  );
  const [pendingFileIds, setPendingFileIds] = useState(
    savedCertificate?.pendingFileIds ?? [],
  );
  const [mediaBusy, setMediaBusy] = useState(NOT_BUSY);
  const [discardToken, setDiscardToken] = useState(0);
  const pickerRef = useRef<OrderPickerHandle>(null);
  const selectOrderRef = useRef<HTMLElement>(null);
  const changeOrderRef = useRef<HTMLElement>(null);
  const guarded =
    isDirty(state) || hasUploadOutsideDraft(mediaBusy, state.draft);
  const { allowNext } = useLeaveConfirmation(guarded);
  const focusChangeOrderAfterPick = useFocusAfterPick(
    state.draft.order,
    changeOrderRef,
  );
  const codeCheck = useCodeCheck(state.draft.code, {
    enabled: true,
    excludeId: state.certificateId,
    savedCode: state.savedCode,
    onTaken: (code) => dispatch({ type: "codeTaken", code }),
  });
  const leaveTo = async (target: string, options?: { replace: boolean }) => {
    await hideFormSaveBar();
    allowNext();
    navigate(target, options);
  };
  const { saving, failure, failedSaves, save, clearFailure } =
    useCertificateSave(state, dispatch, {
      onCreated: (id) => {
        void leaveTo(`/app/certificates/${id}`, { replace: true });
        shopify.toast.show("Certificate created");
      },
      onUpdated: (certificate, sentProjection) => {
        dispatch({ type: "saved", detail: certificate, sentProjection });
        setSavedCertificate(certificate);
        setPendingFileIds(certificate.pendingFileIds);
        shopify.toast.show("Certificate saved");
      },
    });

  useAdminLoading();
  useCodeSuggestion(state, dispatch);
  useInitialFocus(props.kind === "edit", selectOrderRef);
  useMediaCompletion(state.certificateId, pendingFileIds, (certificate) => {
    dispatch({ type: "mediaCompleted", detail: certificate });
    setPendingFileIds(certificate.pendingFileIds);
  });

  const discard = () => {
    const target = discardTarget(props, lastIndexHref);

    setDiscardToken((token) => token + 1);
    clearFailure();

    if (target === null) {
      dispatch({ type: "discard" });

      return;
    }

    void leaveTo(target);
  };

  const pick = (picked: OrderPick) => {
    // "Select order" unmounts on the first pick, so focus moves to "Change order" only then.
    if (!state.draft.order?.id) {
      focusChangeOrderAfterPick();
    }

    dispatch({ type: "pick", ...picked });
  };

  const confirmDelete = async (): Promise<boolean> => {
    const result = await requestJson<DeleteOneResponse>(
      `/api/certificates/${state.certificateId}`,
      { body: { intent: "delete" }, loading: true },
    );

    return result.ok;
  };

  const leaveAfterDelete = () => {
    void leaveTo(lastIndexHref);
    shopify.toast.show("Certificate deleted");
  };

  return (
    <>
      <FormSaveBar
        open={guarded}
        saving={saving}
        saveBlocked={mediaBusy.photo || mediaBusy.video}
        onSave={() => void save()}
        onDiscard={discard}
      />
      <s-page heading={pageHeading(state)} inlineSize="base">
        <s-link slot="breadcrumb-actions" href={lastIndexHref}>
          Certificates
        </s-link>
        {savedCertificate !== null && (
          <EditActions certificateId={savedCertificate.id} />
        )}
        {/* Above both columns, so the main column and the aside start level; the banners follow. */}
        <s-box slot="supplemental-start" paddingBlockEnd="base">
          <s-button
            variant="tertiary"
            icon="chevron-left"
            accessibilityLabel="Back to certificates"
            href={lastIndexHref}
            onClick={(event) => {
              if (opensElsewhere(event)) {
                return;
              }

              // The in-app navigation goes through the leave confirmation like the breadcrumb.
              event.preventDefault();
              navigate(lastIndexHref);
            }}
          >
            Certificates
          </s-button>
        </s-box>
        <FormStatusBanner
          state={state}
          failedSaves={failedSaves}
          failure={failure}
          duplicateMissing={props.kind === "create" && props.duplicateMissing}
        />
        {savedCertificate !== null && (
          <MediaFailureBanner
            mediaErrors={savedCertificate.mediaErrors}
            draft={state.draft}
          />
        )}
        <OrderSection
          kind={props.kind}
          order={state.draft.order}
          lineItem={state.draft.lineItem}
          orderCard={state.draft.orderCard}
          productImageUrl={state.draft.product?.imageUrl ?? null}
          orderError={fieldError(state.errors, "order") ?? null}
          lineItemError={fieldError(state.errors, "lineItem") ?? null}
          filledLine={filledLine(state)}
          onOpenPicker={(open) => pickerRef.current?.prepare(open)}
          selectOrderRef={selectOrderRef}
          changeOrderRef={changeOrderRef}
        />
        <CertificateSection
          state={state}
          dispatch={dispatch}
          codeCheck={codeCheck}
          onNavigate={navigate}
          duplicateOf={
            props.kind === "duplicate" ? { code: props.duplicateOf.code } : null
          }
        />
        <s-section heading="Signed by">
          <SignersSection
            state={state}
            dispatch={dispatch}
            failedSaves={failedSaves}
          />
        </s-section>
        <ProofSection
          state={state}
          dispatch={dispatch}
          discardToken={discardToken}
          onBusyChange={(kind, busy) =>
            setMediaBusy((current) => ({ ...current, [kind]: busy }))
          }
        />
        <NotesSection state={state} dispatch={dispatch} />
        <s-box slot="aside">
          <VerificationPreview
            state={state}
            createdLabel={savedCertificate?.createdLabel ?? null}
            updatedLabel={savedCertificate?.updatedLabel ?? null}
          />
        </s-box>
        <OrderPicker
          ref={pickerRef}
          excludeId={state.certificateId}
          currentOrderId={state.draft.order?.id ?? null}
          prefetch={props.kind !== "edit"}
          onPick={pick}
          onNavigate={navigate}
        />
        {savedCertificate !== null && (
          <DeleteCertificatesModal
            id={DELETE_MODAL_ID}
            codes={[state.savedCode ?? savedCertificate.values.code]}
            onConfirm={confirmDelete}
            onDeleted={leaveAfterDelete}
          />
        )}
      </s-page>
    </>
  );
}
