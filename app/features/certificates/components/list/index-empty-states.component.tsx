import type {
  ListParams,
  ListPatchHandler,
} from "~/features/certificates/utils/list-params.utils";
import { noResultsAction } from "~/features/certificates/utils/index-state.utils";

export function FirstCertificateEmptyState() {
  return (
    <s-section accessibilityLabel="No certificates yet">
      <s-empty-state heading="Create your first certificate">
        <s-icon slot="graphic" type="shield-check-mark" />
        <s-text slot="subheading">
          {
            "Customers enter a certificate's code on your verification page to confirm their item is authentic."
          }
        </s-text>
        <s-button
          slot="primary-action"
          variant="primary"
          href="/app/certificates/new"
        >
          Create certificate
        </s-button>
      </s-empty-state>
    </s-section>
  );
}

export function NoResultsEmptyState({
  params,
  onPatch,
}: {
  params: ListParams;
  onPatch: ListPatchHandler;
}) {
  const action = noResultsAction(params);

  return (
    <s-empty-state heading="No certificates found">
      <s-icon slot="graphic" type="search" />
      <s-text slot="subheading">Try changing the search or filters.</s-text>
      <s-button slot="secondary-actions" onClick={() => onPatch(action.patch)}>
        {action.label}
      </s-button>
    </s-empty-state>
  );
}
