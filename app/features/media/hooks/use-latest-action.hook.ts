import { useMemo, useRef } from "react";

export type LatestAction = {
  begin(): number;
  isCurrent(token: number): boolean;
};

export function useLatestAction(): LatestAction {
  const latestToken = useRef(0);

  return useMemo(
    () => ({
      begin() {
        latestToken.current += 1;

        return latestToken.current;
      },
      isCurrent: (token: number) => token === latestToken.current,
    }),
    [],
  );
}
