import { Fragment } from "react";
import type { OrderItemRow } from "~/features/orders/types/orders.types";
import type { CertificateReference } from "~/shared/types/api.types";
import { listSeparator } from "~/shared/utils/format.utils";
import {
  itemRowLabel,
  itemStatus,
  variantQuantityLine,
  type ItemStatus,
} from "~/features/orders/utils/picker-view.utils";

export function CertificateLinks({
  certificates,
  onOpen,
}: {
  certificates: CertificateReference[];
  onOpen(certificate: CertificateReference): void;
}) {
  return certificates.map((certificate, index) => (
    <Fragment key={certificate.id}>
      {listSeparator(index, certificates.length)}
      <s-link onClick={() => onOpen(certificate)}>{certificate.code}</s-link>
    </Fragment>
  ));
}

function ItemContent({
  row,
  status,
}: {
  row: OrderItemRow;
  status: ItemStatus;
}) {
  const details = variantQuantityLine(row.variantTitle, row.quantity);

  return (
    <s-grid gridTemplateColumns="auto 1fr auto" gap="small" alignItems="center">
      <s-thumbnail size="small" src={row.imageUrl ?? undefined} alt="" />
      <s-stack gap="small-300">
        <s-text color={status.selectable ? "base" : "subdued"}>
          {row.title}
        </s-text>
        {details !== null && <s-text color="subdued">{details}</s-text>}
        {status.text !== null && <s-text color="subdued">{status.text}</s-text>}
      </s-stack>
      {status.badge !== null && (
        <s-badge tone={status.badge.tone}>{status.badge.label}</s-badge>
      )}
    </s-grid>
  );
}

function CertificateLines({
  row,
  onCertificate,
}: {
  row: OrderItemRow;
  onCertificate(certificate: CertificateReference): void;
}) {
  if (row.certificates.length === 0 && row.possibleCertificates.length === 0) {
    return null;
  }

  return (
    <s-box paddingInline="base" paddingBlockEnd="small">
      <s-stack gap="small-300">
        {row.certificates.length > 0 && (
          <s-text color="subdued">
            {row.certificates.length === 1 ? "Certificate: " : "Certificates: "}
            <CertificateLinks
              certificates={row.certificates}
              onOpen={onCertificate}
            />
          </s-text>
        )}
        {row.possibleCertificates.length > 0 && (
          <s-text color="subdued">
            May already have a certificate:{" "}
            <CertificateLinks
              certificates={row.possibleCertificates}
              onOpen={onCertificate}
            />
          </s-text>
        )}
      </s-stack>
    </s-box>
  );
}

export type ItemRowProps = {
  row: OrderItemRow;
  onSelect(row: OrderItemRow): void;
  onCertificate(certificate: CertificateReference): void;
};

export function ItemRow({ row, onSelect, onCertificate }: ItemRowProps) {
  const status = itemStatus(row);

  return (
    <s-box border="base" borderStyle="solid none none none">
      {status.selectable ? (
        <s-clickable
          paddingInline="base"
          paddingBlock="small"
          accessibilityLabel={itemRowLabel(row)}
          onClick={() => onSelect(row)}
        >
          <ItemContent row={row} status={status} />
        </s-clickable>
      ) : (
        <s-box paddingInline="base" paddingBlock="small">
          <ItemContent row={row} status={status} />
        </s-box>
      )}
      <CertificateLines row={row} onCertificate={onCertificate} />
    </s-box>
  );
}
