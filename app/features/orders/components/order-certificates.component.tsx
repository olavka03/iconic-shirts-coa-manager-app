import type { OrderCertificateReference } from "~/features/orders/types/orders.types";
import { InAppLink } from "~/shared/components/in-app-link.component";
import { SUMMARY_ITEM_MAX } from "~/shared/constants/certificate-summary.constants";
import { truncateText } from "~/shared/utils/format.utils";
import { orderToken } from "~/features/orders/utils/orders.utils";

type OrderCertificatesProps = {
  certificates: OrderCertificateReference[];
  orderName: string | null;
  onNavigate(href: string): void;
};

const LISTED_MAX = 5;

function certificateSummary(certificate: OrderCertificateReference): string {
  return [certificate.signers, truncateText(certificate.item, SUMMARY_ITEM_MAX)]
    .filter((part) => part !== "")
    .map((part) => ` · ${part}`)
    .join("");
}

export function OrderCertificates({
  certificates,
  orderName,
  onNavigate,
}: OrderCertificatesProps) {
  if (certificates.length === 0) {
    return null;
  }

  const token = orderToken(orderName);

  return (
    <s-stack gap="small-300">
      <s-text color="subdued">Other certificates for this order</s-text>
      <s-unordered-list>
        {certificates.slice(0, LISTED_MAX).map((certificate) => (
          <s-list-item key={certificate.id}>
            <InAppLink
              href={`/app/certificates/${certificate.id}`}
              onNavigate={onNavigate}
            >
              {certificate.code}
            </InAppLink>
            {certificateSummary(certificate)}
          </s-list-item>
        ))}
      </s-unordered-list>
      {certificates.length > LISTED_MAX && token !== null && (
        <InAppLink href={`/app?q=${token}`} onNavigate={onNavigate}>
          View all {certificates.length}
        </InAppLink>
      )}
    </s-stack>
  );
}
