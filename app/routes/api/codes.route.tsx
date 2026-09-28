import type { CodeCheckResult } from "~/features/codes/types/codes.types";
import { checkCode } from "~/.server/services/codes/codes.service";
import {
  invalid,
  jsonResponse,
  parseIdParam,
  withJsonErrors,
} from "~/.server/services/shared/json-response.utils";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import type { Route } from "./+types/codes.route";

export const loader = ({ request }: Route.LoaderArgs) =>
  withJsonErrors("api.codes.failed", async () => {
    const { session } = await authenticate.admin(request);
    const search = new URL(request.url).searchParams;
    const exclude = search.get("exclude");
    const excludeId = parseIdParam(exclude);

    if (exclude !== null && excludeId === null) {
      return invalid();
    }

    const result = await checkCode(
      session.shop,
      search.get("code") ?? "",
      excludeId ?? undefined,
    );

    return jsonResponse(result satisfies CodeCheckResult);
  });
