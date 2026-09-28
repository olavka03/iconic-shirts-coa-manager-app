let pendingCount = 0;

function showLoading(visible: boolean): void {
  if (typeof shopify === "undefined") {
    return;
  }

  try {
    shopify.loading(visible);
  } catch {
    // App Bridge isn't ready yet; the next change sets the bar again.
  }
}

export function beginLoading(): () => void {
  let ended = false;

  pendingCount++;
  showLoading(true);

  return () => {
    if (ended) {
      return;
    }

    ended = true;
    pendingCount--;
    showLoading(pendingCount > 0);
  };
}
