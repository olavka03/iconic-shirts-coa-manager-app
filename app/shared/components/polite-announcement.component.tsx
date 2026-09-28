// The native region inside a Polaris box: screen readers hear the change, nothing shows (spec §6.1).
export function PoliteAnnouncement({ message }: { message: string }) {
  return (
    <s-box accessibilityVisibility="exclusive">
      <div aria-live="polite">{message}</div>
    </s-box>
  );
}
