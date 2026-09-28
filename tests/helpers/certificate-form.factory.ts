import type {
  FormAction,
  FormKind,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import type { CertificateFormValues } from "~/features/certificates/types/certificates.types";
import { createFormState } from "~/features/certificates/utils/certificate-form-draft.utils";
import type { TeamDictionary } from "~/features/codes/types/code-generator.types";
import { buildTeamDictionary } from "~/features/codes/utils/team-dictionary.utils";
import type {
  OrderDetail,
  OrderItemRow,
  OrderRow,
} from "~/features/orders/types/orders.types";
import type { SignerValue } from "~/features/signers/types/signers.types";
import { testId } from "./test-ids.utils";

const BAYERN_TITLE =
  "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home";

export function orderRow(
  name: string,
  overrides: Partial<OrderRow> = {},
): OrderRow {
  const digits = name.replace(/\D/g, "");

  return {
    id: `gid://shopify/Order/${digits}`,
    numericId: digits,
    name,
    createdLabel: "26 Sep 2026 at 14:05",
    fulfillment: { label: "Unfulfilled", tone: "caution" },
    cancelled: false,
    itemCount: 1,
    itemSummary: "",
    certificateCount: 0,
    ...overrides,
  };
}

export function itemRow(
  title: string,
  overrides: Partial<OrderItemRow> = {},
): OrderItemRow {
  return {
    id: "gid://shopify/LineItem/1",
    title,
    variantTitle: null,
    quantity: 1,
    imageUrl: null,
    product: null,
    certificates: [],
    possibleCertificates: [],
    includesThis: false,
    state: "open",
    ...overrides,
  };
}

export function orderDetail(
  order: OrderRow,
  items: OrderItemRow[],
  overrides: Partial<OrderDetail> = {},
): OrderDetail {
  return {
    order,
    lineItems: items,
    legacyCertificates: [],
    orderCertificates: [],
    takenCodes: [],
    ...overrides,
  };
}

export function pickAction(
  orderName: string,
  item: OrderItemRow,
  overrides: Partial<OrderDetail> = {},
): FormAction {
  const order = orderRow(orderName);

  return {
    type: "pick",
    order,
    item,
    detail: orderDetail(order, [item], overrides),
  };
}

export function signerValue(
  name: string,
  overrides: Partial<SignerValue> = {},
): SignerValue {
  return { name, date: null, location: "", ...overrides };
}

type FormDefaults = {
  values?: Partial<CertificateFormValues>;
  dictionary?: TeamDictionary;
};

// Each test file opens its forms from its own saved values and team dictionary.
export function certificateFormBuilders({
  values: fileValues = {},
  dictionary = buildTeamDictionary([]),
}: FormDefaults = {}) {
  function formValues(
    overrides: Partial<CertificateFormValues> = {},
  ): CertificateFormValues {
    return {
      code: "IS141002RLBM1516",
      item: "Bayern Munich Football Shirt - 2015-16 Home",
      notes: "",
      order: { id: "gid://shopify/Order/141002", name: "#141002" },
      lineItem: { id: "gid://shopify/LineItem/1", title: BAYERN_TITLE },
      product: null,
      photo: null,
      video: null,
      signers: [signerValue("Robert Lewandowski")],
      ...fileValues,
      ...overrides,
    };
  }

  function openForm(
    kind: FormKind,
    overrides: Partial<CertificateFormValues> = {},
    formDictionary = dictionary,
  ): FormState {
    return createFormState({
      kind,
      values: formValues(overrides),
      certificateId: kind === "edit" ? testId(7) : null,
      codePrefix: "IS",
      dictionary: formDictionary,
    });
  }

  return { formValues, openForm };
}
