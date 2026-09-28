import { isRouteErrorResponse, useAsyncError } from "react-router";
import { LoadErrorPage } from "./load-error-page.component";
import { NotFoundPage } from "./not-found-page.component";

// The errorElement of a streamed page: a 404 reads as Not found, anything else as a load error.
export function AsyncLoadError({ scope }: { scope: "index" | "certificate" }) {
  const error = useAsyncError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return <LoadErrorPage scope={scope} />;
}
