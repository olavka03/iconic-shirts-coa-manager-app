import { fireEvent } from "@testing-library/react";

// Tests never load polaris.js, so a Polaris field is a plain element and its value is set by hand.
export function currentValue(element: Element): string | null {
  return "value" in element
    ? String(element.value)
    : element.getAttribute("value");
}

export function typeInto(element: Element, value: string) {
  Object.defineProperty(element, "value", {
    value,
    configurable: true,
    writable: true,
  });
  fireEvent.input(element);
}
