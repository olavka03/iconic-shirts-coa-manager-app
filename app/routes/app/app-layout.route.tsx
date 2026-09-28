import {
  Outlet,
  useLocation,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { PageSkeleton } from "~/features/certificates/components/skeletons/page-skeleton.component";
import { pageSkeletonFor } from "~/features/certificates/utils/page-skeleton.utils";
import { PolarisHydrationActivator } from "~/shared/components/polaris-hydration-activator.component";
import { POLARIS_URL } from "~/shared/constants/polaris.constants";
import { embeddedHeaders } from "~/.server/shopify/embedded-headers.utils";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import type { Route } from "./+types/app-layout.route";

export const loader = async ({ request }: Route.LoaderArgs) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App({ loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const location = useLocation();
  // While the next page's module and loader are on their way, show that page's skeleton at once.
  const pendingPage =
    navigation.state === "loading"
      ? pageSkeletonFor(location, navigation.location)
      : null;

  return (
    <AppProvider apiKey={loaderData.apiKey} polarisUrl={POLARIS_URL}>
      <s-app-nav>
        <s-link href="/app" {...{ rel: "home" }}>
          Certificates
        </s-link>
      </s-app-nav>
      <PolarisHydrationActivator />
      {pendingPage === null ? <Outlet /> : <PageSkeleton kind={pendingPage} />}
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = embeddedHeaders;
