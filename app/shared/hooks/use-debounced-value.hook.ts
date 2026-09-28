import { useEffect, useState } from "react";

export function useDebouncedValue<Value>(value: Value, delayMs: number): Value {
  const [debounced, setDebounced] = useState(() => value);

  useEffect(() => {
    // The updater form keeps a function value from being called as an updater.
    const timer = setTimeout(() => setDebounced(() => value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
