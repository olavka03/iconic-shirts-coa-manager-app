import {
  index,
  prefix,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

// Module paths are relative to app/.
export default [
  index("routes/auth/login.route.tsx"),
  route("auth/*", "routes/auth/shopify-auth.route.tsx"),

  route("app", "routes/app/app-layout.route.tsx", [
    index("routes/app/certificate-list.route.tsx"),
    ...prefix("certificates", [
      index("routes/app/certificate-list-redirect.route.tsx"),
      route("new", "routes/app/certificate-new.route.tsx"),
      route(":id", "routes/app/certificate-edit.route.tsx"),
    ]),
  ]),

  ...prefix("api", [
    route("certificates", "routes/api/certificates.route.tsx"),
    route("certificates/:id", "routes/api/certificate-by-id.route.tsx"),
    route("codes", "routes/api/codes.route.tsx"),
    route("files", "routes/api/files.route.tsx"),
    route("orders", "routes/api/orders.route.tsx"),
  ]),

  route("proxy/verify", "routes/proxy/verify-certificate.route.tsx"),

  ...prefix("webhooks/app", [
    route("uninstalled", "routes/webhooks/app-uninstalled.route.tsx"),
    route("scopes_update", "routes/webhooks/app-scopes-update.route.tsx"),
  ]),
] satisfies RouteConfig;
