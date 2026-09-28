import { useEffect } from "react";
import { useNavigation } from "react-router";
import { beginLoading } from "~/shared/utils/admin-loading.utils";

export function useAdminLoading(extraBusy = false): void {
  const busy = useNavigation().state !== "idle" || extraBusy;

  useEffect(() => {
    if (!busy) {
      return;
    }

    return beginLoading();
  }, [busy]);
}
