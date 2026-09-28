import { useEffect, useState, type RefObject } from "react";
import { useLocation } from "react-router";

// A field whose value the URL also holds. A navigation that lands while the user is still typing must not
// overwrite newer keystrokes, so the URL value only replaces the draft when the field isn't focused.
export function useUrlDraft(
  urlValue: string,
  field: RefObject<HTMLElement | null>,
): [string, (value: string) => void] {
  const { key } = useLocation();
  const [draft, setDraft] = useState(urlValue);

  useEffect(() => {
    if (document.activeElement !== field.current) {
      setDraft(urlValue);
    }
  }, [key, urlValue, field]);

  return [draft, setDraft];
}
