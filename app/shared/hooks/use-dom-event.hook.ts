import { useEffect, type RefObject } from "react";

// Polaris custom events (nextpage, remove, aftershow, …) through addEventListener: works on SSR-rendered
// elements before the Polaris bridge activates, and fires once (spec §6.1).
export function useDomEvent<TargetElement extends HTMLElement>(
  ref: RefObject<TargetElement | null>,
  type: string,
  handler: (event: Event) => void,
): void {
  // No deps: the element can mount after this component or be swapped (empty state → table), so rebind every render.
  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    element.addEventListener(type, handler);

    return () => element.removeEventListener(type, handler);
  });
}
