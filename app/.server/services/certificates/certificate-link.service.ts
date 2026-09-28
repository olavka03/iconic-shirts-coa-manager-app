import { runTransaction } from "~/.server/db/transaction.utils";
import { codeToHandle } from "~/features/codes/utils/code.utils";
import {
  countForLineItem,
  lockLineItem,
  setOrderLink,
  type OrderLinkColumns,
} from "~/.server/repositories/order-links.repository";
import { enqueueUpsert } from "~/.server/repositories/sync-queue.repository";

export type LinkOutcome = "linked" | "capacity_full" | "already_linked";

// The advisory lock serialises links and saves for one line item, so capacity holds across both.
export function linkCertificateToOrder(
  shop: string,
  certificateId: string,
  columns: OrderLinkColumns,
  capacity: number,
): Promise<LinkOutcome> {
  return runTransaction(async (transaction) => {
    await lockLineItem(transaction, shop, columns.lineItemId);

    const linked = await countForLineItem(
      transaction,
      shop,
      columns.lineItemId,
    );

    if (linked >= capacity) {
      return "capacity_full";
    }

    const row = await setOrderLink(transaction, shop, certificateId, columns);

    if (!row) {
      return "already_linked";
    }

    await enqueueUpsert(transaction, {
      shop,
      certificateId,
      version: row.version,
      handle: codeToHandle(row.code),
    });

    return "linked";
  });
}
