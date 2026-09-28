import { Suspense } from "react";
import { Await } from "react-router";
import type { CertificateFormProps } from "~/features/certificates/types/certificate-form.types";
import { AsyncLoadError } from "./async-load-error.component";
import { CertificateForm } from "./form/certificate-form.component";
import {
  CertificatesIndexPage,
  type IndexData,
} from "./list/certificates-index-page.component";
import { NotFoundPage } from "./not-found-page.component";
import {
  CertificateSkeleton,
  IndexSkeleton,
} from "./skeletons/page-skeleton.component";

type EditFormProps = Extract<CertificateFormProps, { kind: "edit" }>;
type NewFormProps = Exclude<CertificateFormProps, { kind: "edit" }>;

// A filter or sort change is a transition, so the revealed list stays (with its loading state) until the new one is in.
export function StreamedIndexPage({
  view,
  list,
}: {
  view: "table" | "grid";
  list: Promise<IndexData>;
}) {
  return (
    <Suspense fallback={<IndexSkeleton view={view} />}>
      <Await resolve={list} errorElement={<AsyncLoadError scope="index" />}>
        {(data) => <CertificatesIndexPage {...data} />}
      </Await>
    </Suspense>
  );
}

// Null is a certificate that doesn't exist or belongs to another shop.
export function StreamedEditForm({
  form,
}: {
  form: Promise<EditFormProps | null>;
}) {
  return (
    <Suspense fallback={<CertificateSkeleton />}>
      <Await
        resolve={form}
        errorElement={<AsyncLoadError scope="certificate" />}
      >
        {(editForm) =>
          editForm === null ? (
            <NotFoundPage />
          ) : (
            <CertificateForm key={editForm.certificate.id} {...editForm} />
          )
        }
      </Await>
    </Suspense>
  );
}

export function StreamedNewForm({ form }: { form: Promise<NewFormProps> }) {
  return (
    <Suspense fallback={<CertificateSkeleton />}>
      <Await
        resolve={form}
        errorElement={<AsyncLoadError scope="certificate" />}
      >
        {(newForm) => (
          <CertificateForm
            key={
              newForm.kind === "duplicate"
                ? `duplicate-${newForm.duplicateOf.id}`
                : "create"
            }
            {...newForm}
          />
        )}
      </Await>
    </Suspense>
  );
}
