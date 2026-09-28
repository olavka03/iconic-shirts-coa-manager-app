import { useLastIndexHref } from "~/features/certificates/hooks/use-last-index-search.hook";

function LoadErrorBanner({ heading }: { heading: string }) {
  return (
    <s-banner slot="supplemental-start" tone="critical" heading={heading}>
      <s-paragraph>
        Reload the page to try again. If it keeps happening, contact your app
        developer.
      </s-paragraph>
      <s-button
        slot="secondary-actions"
        onClick={() => window.location.reload()}
      >
        Reload page
      </s-button>
    </s-banner>
  );
}

function IndexLoadError() {
  return (
    <s-page heading="Certificates" inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/certificates/new"
      >
        Create certificate
      </s-button>
      <LoadErrorBanner heading="Certificates couldn't be loaded" />
    </s-page>
  );
}

function CertificateLoadError() {
  const indexHref = useLastIndexHref();

  return (
    <s-page heading="Certificate">
      <s-link slot="breadcrumb-actions" href={indexHref}>
        Certificates
      </s-link>
      <LoadErrorBanner heading="This certificate couldn't be loaded" />
    </s-page>
  );
}

export function LoadErrorPage({ scope }: { scope: "index" | "certificate" }) {
  return scope === "index" ? <IndexLoadError /> : <CertificateLoadError />;
}
