// Shared by services and UI, so the UI never imports app/.server. Types only.
export type FieldErrors = Record<string, string>;

export type BadgeTone =
  "auto" | "info" | "success" | "caution" | "warning" | "critical";

export type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";

export type CertificateReference = { id: string; code: string };

// Response bodies of the api.* routes. Every failure body has ok: false.
export type FormError = "unavailable" | "not_found" | "orders_access";

export type ErrorBody = {
  ok: false;
  formError?: FormError;
  fieldErrors?: FieldErrors;
  error?: string;
};
