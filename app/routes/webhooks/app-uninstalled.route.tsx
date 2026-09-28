import { authenticate } from "~/.server/shopify/shopify-app.config";
import prisma from "~/.server/db/prisma.singleton";
import { log } from "~/.server/logging/logger.service";
import type { Route } from "./+types/app-uninstalled.route";

export const action = async ({ request }: Route.ActionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  log.info("webhook.received", { shop, topic });

  // The webhook can arrive more than once, so an earlier delivery may already have deleted the session.
  if (session) {
    await prisma.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
