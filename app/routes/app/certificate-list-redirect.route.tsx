import { RouteErrorBoundary } from "~/features/certificates/components/route-error-boundary.component";
import { embeddedHeaders } from "~/.server/shopify/embedded-headers.utils";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import type { Route } from "./+types/certificate-list-redirect.route";

// The redirect from authenticate.admin also handles the admin's bounce requests.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const { redirect } = await authenticate.admin(request);

  return redirect("/app" + new URL(request.url).search);
};

export function ErrorBoundary() {
  return <RouteErrorBoundary scope="index" />;
}

export const headers = embeddedHeaders;
