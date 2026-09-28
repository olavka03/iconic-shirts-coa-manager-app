import type { FilesStatusResponse } from "~/features/media/types/media.types";
import { mediaKindOfFileId } from "~/features/media/utils/media.utils";
import {
  invalid,
  jsonResponse,
  withJsonErrors,
} from "~/.server/services/shared/json-response.utils";
import { getMediaStatuses } from "~/.server/services/media/media.service";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import type { Route } from "./+types/files.route";

const MAX_STATUS_IDS = 10;

function parseFileIds(rawIds: string | null): string[] | null {
  if (rawIds === null) {
    return null;
  }

  const ids = rawIds.split(",");
  const allFileIds = ids.every((id) => mediaKindOfFileId(id) !== null);

  return ids.length <= MAX_STATUS_IDS && allFileIds ? ids : null;
}

export const loader = ({ request }: Route.LoaderArgs) =>
  withJsonErrors("api.files.statuses_failed", async () => {
    const { admin } = await authenticate.admin(request);
    const ids = parseFileIds(new URL(request.url).searchParams.get("ids"));

    if (ids === null) {
      return invalid();
    }

    return jsonResponse({
      files: await getMediaStatuses(admin, ids),
    } satisfies FilesStatusResponse);
  });
