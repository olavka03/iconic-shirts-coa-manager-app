export function FailureBanner({
  heading,
  onRetry,
}: {
  heading: string;
  onRetry(): void;
}) {
  return (
    <s-box padding="base">
      <s-banner tone="critical" heading={heading}>
        Check your connection and try again.
        <s-button slot="secondary-actions" onClick={onRetry}>
          Try again
        </s-button>
      </s-banner>
    </s-box>
  );
}

export function AccessBanner() {
  return (
    <s-box padding="base">
      <s-banner tone="critical" heading="Orders aren't available">
        This app doesn&apos;t have access to your store&apos;s orders. Contact
        your app developer.
      </s-banner>
    </s-box>
  );
}

export function CenteredSpinner({ label }: { label: string }) {
  return (
    <s-box padding="large">
      <s-stack alignItems="center">
        <s-spinner size="large" accessibilityLabel={label} />
      </s-stack>
    </s-box>
  );
}
