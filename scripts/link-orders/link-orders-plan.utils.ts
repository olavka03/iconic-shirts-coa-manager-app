import type { TeamDictionary } from "~/features/codes/types/code-generator.types";
import { legacyCandidateItems } from "~/features/codes/utils/legacy-match.utils";
import type {
  LinkableLineItemNode,
  LinkableOrder,
} from "~/.server/gateways/orders.gateway";
import type { UnlinkedCertificateRow } from "~/.server/repositories/order-links.repository";
import type {
  LinkIssue,
  LinkIssueCode,
  OrderPlan,
  PlannedLink,
} from "./link-orders.types";

type OrderPlanInput = {
  order: LinkableOrder;
  certificates: readonly UnlinkedCertificateRow[];
  linkedCounts: ReadonlyMap<string, number>;
  dictionary: TeamDictionary;
};

export function groupByOrderName(
  certificates: readonly UnlinkedCertificateRow[],
): Map<string, UnlinkedCertificateRow[]> {
  const groups = new Map<string, UnlinkedCertificateRow[]>();

  for (const certificate of certificates) {
    const group = groups.get(certificate.orderName) ?? [];

    group.push(certificate);
    groups.set(certificate.orderName, group);
  }

  return groups;
}

export function issuesForOrder(
  code: LinkIssueCode,
  orderName: string,
  certificates: readonly UnlinkedCertificateRow[],
  message: string,
): LinkIssue[] {
  return certificates.map((certificate) => ({
    code,
    orderName,
    certificateCode: certificate.code,
    message,
  }));
}

const titlesOf = (items: readonly LinkableLineItemNode[]) =>
  items.map((item) => `"${item.title}"`).join(", ");

function plannedLink(
  certificate: UnlinkedCertificateRow,
  order: LinkableOrder,
  item: LinkableLineItemNode,
): PlannedLink {
  return {
    certificateId: certificate.id,
    certificateCode: certificate.code,
    capacity: item.currentQuantity,
    columns: {
      orderId: order.id,
      orderName: order.name,
      lineItemId: item.id,
      lineItemTitle: item.title,
      productId: item.product?.id ?? null,
      productTitle: item.product?.title ?? null,
      productImageUrl: item.product?.imageUrl ?? null,
    },
  };
}

// A certificate is linked only to the one item it matches, and only while that item has a free unit
// (the certificates already linked to it plus the new links stay within its current quantity).
export function planOrderLinks({
  order,
  certificates,
  linkedCounts,
  dictionary,
}: OrderPlanInput): OrderPlan {
  if (order.moreLineItems) {
    return {
      links: [],
      issues: issuesForOrder(
        "AMBIGUOUS",
        order.name,
        certificates,
        "The order has more than 50 items. Link it in the app.",
      ),
    };
  }

  const candidates = legacyCandidateItems(
    certificates,
    order.lineItems,
    dictionary,
  );
  const itemsById = new Map(order.lineItems.map((item) => [item.id, item]));
  const used = new Map(linkedCounts);
  const links: PlannedLink[] = [];
  const issues: LinkIssue[] = [];
  const addIssue = (
    code: LinkIssueCode,
    certificate: UnlinkedCertificateRow,
    message: string,
  ) =>
    issues.push({
      code,
      orderName: order.name,
      certificateCode: certificate.code,
      message,
    });

  for (const certificate of certificates) {
    const matches = (candidates.get(certificate.id) ?? []).flatMap((id) => {
      const item = itemsById.get(id);

      return item ? [item] : [];
    });

    if (matches.length === 0) {
      addIssue("NO_MATCH", certificate, "No item in the order matches.");
      continue;
    }

    if (matches.length > 1) {
      addIssue("AMBIGUOUS", certificate, `Matches ${titlesOf(matches)}.`);
      continue;
    }

    const [item] = matches;
    const taken = used.get(item.id) ?? 0;

    if (taken >= item.currentQuantity) {
      addIssue(
        "CAPACITY_FULL",
        certificate,
        `"${item.title}" already has ${taken} of ${item.currentQuantity} certificates.`,
      );
      continue;
    }

    used.set(item.id, taken + 1);
    links.push(plannedLink(certificate, order, item));
  }

  return { links, issues };
}
