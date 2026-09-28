import type {
  BadgeTone,
  CertificateReference,
  ErrorBody,
  ProductStatus,
} from "~/shared/types/api.types";

export type FulfillmentBadge = { label: string; tone: BadgeTone };

// id null = not linked (legacy); name is backfilled or null.
export type OrderValue = { id: string | null; name: string | null };

// title is the stored snapshot.
export type LineItemValue = { id: string; title: string };

// Live read on the certificate page.
export type OrderCard = {
  createdLabel: string;
  fulfillment: FulfillmentBadge;
  cancelled: boolean;
  // Non-gift-card items with currentQuantity > 0.
  selectableItems: number;
  // null: the item is no longer in the order.
  lineItem: {
    variantTitle: string | null;
    quantity: number;
    imageUrl: string | null;
  } | null;
};

export type OrderCertificateReference = {
  id: string;
  code: string;
  signers: string;
  item: string;
  lineItemId: string | null;
};

// /api/orders carries no customer, address, email, phone, price or payment data.
export type OrderRow = {
  id: string;
  numericId: string;
  name: string;
  createdLabel: string;
  fulfillment: FulfillmentBadge;
  cancelled: boolean;
  // currentSubtotalLineItemsQuantity
  itemCount: number;
  // The first three live line item titles, joined by ", ".
  itemSummary: string;
  // Linked by id plus legacy by name.
  certificateCount: number;
};

export type OrderItemRow = {
  id: string;
  title: string;
  variantTitle: string | null;
  // currentQuantity
  quantity: number;
  // Line item image ?? product preview image.
  imageUrl: string | null;
  product: {
    id: string;
    title: string;
    imageUrl: string | null;
    status: ProductStatus;
  } | null;
  // Linked to this line item, the excluded certificate left out.
  certificates: CertificateReference[];
  // Imported certificates matched to it.
  possibleCertificates: CertificateReference[];
  includesThis: boolean;
  state: "open" | "complete" | "removed";
};

export type OrderDetail = {
  order: OrderRow;
  lineItems: OrderItemRow[];
  // orderId null, orderName = this order's name, matched to no item.
  legacyCertificates: CertificateReference[];
  // Every certificate of the order except the excluded one.
  orderCertificates: OrderCertificateReference[];
  // codesContaining(orderToken(name)), the excluded certificate's own code left out.
  takenCodes: string[];
};

export type OrdersListResponse =
  { ok: true; orders: OrderRow[]; more: boolean } | ErrorBody;

export type OrderDetailResponse =
  { ok: true; detail: OrderDetail | null } | ErrorBody;
