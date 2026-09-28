import { useEffect, useRef } from "react";

export function useLatest<Value>(value: Value): { readonly current: Value } {
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
  });

  return latest;
}
