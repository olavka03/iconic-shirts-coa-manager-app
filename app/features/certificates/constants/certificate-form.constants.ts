import type { CertificateFormValues } from "~/features/certificates/types/certificates.types";

export const SIGNER_ERROR_KEY = /^signers\.(\d+)(?:\.(.+))?$/;

export const EMPTY_VALUES: CertificateFormValues = {
  code: "",
  item: "",
  notes: "",
  order: null,
  lineItem: null,
  product: null,
  photo: null,
  video: null,
  signers: [{ name: "", date: null, location: "" }],
};

export const SAVE_BAR_ID = "certificate-save-bar";
export const DELETE_MODAL_ID = "delete-certificate-modal";
