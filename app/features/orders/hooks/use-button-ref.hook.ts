import { useImperativeHandle, useRef, type Ref } from "react";

// The form keeps plain HTMLElement refs; Polaris types an s-button ref as its Button class.
export function useButtonRef(ref: Ref<HTMLElement> | undefined) {
  const button = useRef<HTMLElementTagNameMap["s-button"]>(null);

  useImperativeHandle<HTMLElement | null, HTMLElement | null>(
    ref,
    () => button.current,
    [],
  );

  return button;
}
