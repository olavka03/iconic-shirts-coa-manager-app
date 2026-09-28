import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

interface LoginErrorMessage {
  shop?: string;
}

const SHOP_ERRORS = {
  [LoginErrorType.MissingShop]: "Enter your shop domain to log in.",
  [LoginErrorType.InvalidShop]:
    "Enter a valid shop domain, like example.myshopify.com.",
} satisfies Record<LoginErrorType, string>;

export function loginErrorMessage(loginErrors: LoginError): LoginErrorMessage {
  const shopError = loginErrors?.shop;

  return shopError ? { shop: SHOP_ERRORS[shopError] } : {};
}
