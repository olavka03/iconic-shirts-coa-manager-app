import "@shopify/app-bridge-types";

type AppBridgeIntrinsicElements = JSX.IntrinsicElements; // the global JSX that app-bridge-types augments

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends AppBridgeIntrinsicElements {}
  }
}
