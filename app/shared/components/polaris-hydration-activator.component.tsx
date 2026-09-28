import { useEffect, useState } from "react";

// Rendering one Polaris element after hydration makes the Polaris React bridge process the server-rendered
// elements (SSR defaultValue and choice-list selections), spec §6.1.
export function PolarisHydrationActivator() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return mounted ? <s-box display="none" /> : null;
}
