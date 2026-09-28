import { isRouteErrorResponse, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { LoadErrorPage } from "./load-error-page.component";
import { NotFoundPage } from "./not-found-page.component";

export function RouteErrorBoundary({
  scope,
}: {
  scope: "index" | "certificate";
}) {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  if (isRouteErrorResponse(error)) {
    return boundary.error(error);
  }

  return <LoadErrorPage scope={scope} />;
}
