import { redirect, Form } from "react-router";
import { login } from "~/.server/shopify/shopify-app.config";
import { loginErrorMessage } from "~/.server/shopify/login-errors.utils";
import type { Route } from "./+types/login.route";
import styles from "./login.module.css";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function LoginRoute({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const errors = actionData?.errors;

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>COA Manager</h1>
        {loaderData.showForm && (
          <Form className={styles.form} method="post">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>{errors?.shop ?? "example.myshopify.com"}</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
      </div>
    </div>
  );
}
