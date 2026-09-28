import { useLastIndexHref } from "~/features/certificates/hooks/use-last-index-search.hook";

export function NotFoundPage() {
  const indexHref = useLastIndexHref();

  return (
    <s-page heading="Certificate not found">
      <s-link slot="breadcrumb-actions" href={indexHref}>
        Certificates
      </s-link>
      <s-section accessibilityLabel="Certificate not found">
        <s-empty-state heading="This certificate doesn't exist">
          <s-icon slot="graphic" type="search-resource" />
          <s-text slot="subheading">
            It may have been deleted, or the link may be wrong.
          </s-text>
          <s-button slot="primary-action" variant="primary" href="/app">
            View certificates
          </s-button>
        </s-empty-state>
      </s-section>
    </s-page>
  );
}
