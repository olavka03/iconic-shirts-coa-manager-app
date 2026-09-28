import { authenticate } from "~/.server/shopify/shopify-app.config";
import prisma from "~/.server/db/prisma.singleton";
import { log } from "~/.server/logging/logger.service";
import type { Route } from "./+types/app-scopes-update.route";

export const action = async ({ request }: Route.ActionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  log.info("webhook.received", { shop, topic });

  const currentScopes = payload.current as string[];

  if (session) {
    await prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: currentScopes.toString(),
      },
    });
  }

  return new Response();
};
