import type { ReactNode } from "react";

type InAppLinkProps = {
  href: string;
  onNavigate(href: string): void;
  children: ReactNode;
};

// Polaris types it as Event, but React passes its synthetic event, whose nativeEvent is the MouseEvent.
export function opensElsewhere(event: Event): boolean {
  const domEvent = "nativeEvent" in event ? event.nativeEvent : event;

  return (
    domEvent instanceof MouseEvent &&
    (domEvent.metaKey ||
      domEvent.ctrlKey ||
      domEvent.shiftKey ||
      domEvent.altKey)
  );
}

// polaris.js skips its own shopify:navigate for a click that is already handled, so the app navigates once.
export function InAppLink({ href, onNavigate, children }: InAppLinkProps) {
  return (
    <s-link
      href={href}
      onClick={(event) => {
        if (opensElsewhere(event)) {
          return;
        }

        event.preventDefault();
        onNavigate(href);
      }}
    >
      {children}
    </s-link>
  );
}
