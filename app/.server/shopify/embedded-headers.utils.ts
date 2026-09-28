import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const embeddedHeaders: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
