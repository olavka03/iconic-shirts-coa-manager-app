import type { MediaKind } from "~/features/media/types/media.types";
import { MEDIA_FILE_TYPES } from "./media.utils";

type PickResult = { fileId: string } | "closed" | "failed";

// App Bridge is loaded before the app, so availability never changes after the first render.
export function subscribeToFilePicker(): () => void {
  return () => {};
}

export function canPickFiles(): boolean {
  return (
    typeof shopify !== "undefined" &&
    typeof shopify.intents?.invoke === "function"
  );
}

// The Files picker also uploads from the merchant's device, so it is the only upload path.
export async function pickFile(kind: MediaKind): Promise<PickResult> {
  try {
    const activity = await shopify.intents.invoke?.("pick:shopify/File", {
      data: {
        mediaTypes: [MEDIA_FILE_TYPES[kind]],
        multiSelect: false,
      },
    });
    const response = await activity?.complete;

    if (response?.code === "closed") {
      return "closed";
    }

    if (response?.code !== "ok") {
      return "failed";
    }

    const ids = response.data?.ids;

    return Array.isArray(ids) && typeof ids[0] === "string"
      ? { fileId: ids[0] }
      : "closed";
  } catch {
    return "failed";
  }
}
