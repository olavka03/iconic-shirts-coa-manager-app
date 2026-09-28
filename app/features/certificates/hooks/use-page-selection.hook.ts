import { useState } from "react";

export type PageSelection = {
  ids: string[];
  all: boolean;
  some: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
};

const NONE: ReadonlySet<string> = new Set();

// The selection belongs to the location it was made on, so any URL change drops it during render.
export function usePageSelection(
  locationKey: string,
  pageIds: string[],
): PageSelection {
  const [state, setState] = useState({ key: locationKey, ids: NONE });
  const current = state.key === locationKey ? state.ids : NONE;
  const ids = pageIds.filter((id) => current.has(id));
  const all = pageIds.length > 0 && ids.length === pageIds.length;
  const select = (next: ReadonlySet<string>) =>
    setState({ key: locationKey, ids: next });

  return {
    ids,
    all,
    some: ids.length > 0 && !all,
    has: (id) => current.has(id),
    toggle: (id) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      select(next);
    },
    toggleAll: () => select(all ? NONE : new Set(pageIds)),
    clear: () => select(NONE),
  };
}
