import "./shared/bootstrap.setup";
import { parseArgs } from "node:util";
import prisma from "~/.server/db/prisma.singleton";
import {
  runSyncRetryJob,
  type JobOptions,
} from "~/.server/jobs/sync-retry.job";
import { errorName, log } from "~/.server/logging/logger.service";

function readOptions(): JobOptions {
  const { values } = parseArgs({
    options: {
      shop: { type: "string" },
      all: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });

  return { shop: values.shop, all: values.all, dryRun: values["dry-run"] };
}

try {
  console.log(JSON.stringify(await runSyncRetryJob(readOptions())));
} catch (error) {
  log.error("job.crashed", { error: errorName(error) });
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
