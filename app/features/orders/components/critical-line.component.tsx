export function CriticalLine({ message }: { message: string }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-icon type="alert-circle" tone="critical" />
      <s-text tone="critical">{message}</s-text>
    </s-stack>
  );
}
