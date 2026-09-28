import type {
  Draft,
  FillKey,
  FormAction,
  FormState,
  LinkedProductPick,
} from "~/features/certificates/types/certificate-form.types";
import {
  currentSignerNames,
  parseTitle,
  withDraft,
} from "~/features/certificates/utils/certificate-form-draft.utils";
import { withoutKeys } from "~/features/certificates/utils/certificate-form-errors.utils";
import { retargetCode } from "~/features/codes/utils/code-suggestion.utils";
import type {
  OrderCard,
  OrderItemRow,
} from "~/features/orders/types/orders.types";
import { recomputeAutoCode, withCode } from "./certificate-form-code.reducer";
import { withSignerNames } from "./certificate-form-signers.reducer";

type PickAction = Extract<FormAction, { type: "pick" }>;
type Fill = { patch: Partial<Draft>; filled: FillKey[] };

export function linkProduct(
  state: FormState,
  product: LinkedProductPick,
): FormState {
  const { draft } = state;
  const item = parseTitle(product.title, state.dictionary).item;
  const fills =
    item !== "" &&
    (draft.item.trim() === "" || draft.item === draft.derivedItem);

  return withDraft(state, {
    product: { ...product, missing: false },
    touched: { ...draft.touched, product: true },
    ...(fills ? { item, derivedItem: item } : {}),
  });
}

function pickOrderCard(action: PickAction): OrderCard {
  return {
    createdLabel: action.order.createdLabel,
    fulfillment: action.order.fulfillment,
    cancelled: action.order.cancelled,
    selectableItems: action.detail.lineItems.filter(
      (lineItem) => lineItem.state !== "removed",
    ).length,
    lineItem: {
      variantTitle: action.item.variantTitle,
      quantity: action.item.quantity,
      imageUrl: action.item.imageUrl,
    },
  };
}

function fillItem(
  state: FormState,
  legacyLink: boolean,
  parsedItem: string,
): Fill {
  const { draft } = state;
  const fillable =
    state.kind === "edit"
      ? draft.item.trim() === "" ||
        (!legacyLink && draft.item === draft.derivedItem)
      : !draft.touched.item;

  if (!fillable) {
    return { patch: {}, filled: [] };
  }

  return parsedItem !== "" && parsedItem !== draft.item
    ? { patch: { item: parsedItem, derivedItem: parsedItem }, filled: ["item"] }
    : { patch: { derivedItem: parsedItem }, filled: [] };
}

function fillProduct(
  state: FormState,
  legacyLink: boolean,
  picked: OrderItemRow["product"],
): Fill {
  const { draft } = state;
  const fillable =
    !draft.touched.product &&
    (state.kind !== "edit" ||
      draft.product === null ||
      (!legacyLink && draft.product.id === draft.derivedProductId));

  if (!fillable) {
    return { patch: {}, filled: [] };
  }

  const derivedProductId = picked?.id ?? null;

  if (picked && picked.id !== draft.product?.id) {
    return {
      patch: { product: { ...picked, missing: false }, derivedProductId },
      filled: ["product"],
    };
  }

  if (!picked && draft.product && !legacyLink) {
    return {
      patch: { product: null, derivedProductId },
      filled: ["product-removed"],
    };
  }

  return { patch: { derivedProductId }, filled: [] };
}

function pickCode(
  before: Draft,
  state: FormState,
  orderName: string,
): FormState {
  if (state.kind === "edit") {
    return state;
  }

  if (state.codeMode === "auto") {
    return recomputeAutoCode(state);
  }

  return before.order?.name
    ? withCode(
        state,
        retargetCode(
          state.draft.code,
          state.codePrefix,
          before.order.name,
          orderName,
        ),
      )
    : state;
}

export function applyPick(state: FormState, action: PickAction): FormState {
  const before = state.draft;
  const parsed = parseTitle(action.item.title, state.dictionary);
  const legacyLink = state.kind === "edit" && !state.baseline.order?.id;
  const item = fillItem(state, legacyLink, parsed.item);
  const product = fillProduct(state, legacyLink, action.item.product);
  const fillsSigners =
    parsed.signers.length > 0 && currentSignerNames(before).length === 0;
  const picked: FormState = {
    ...withDraft(state, {
      ...item.patch,
      ...product.patch,
      order: { id: action.order.id, name: action.order.name },
      lineItem: { id: action.item.id, title: action.item.title },
      orderCard: pickOrderCard(action),
      orderCertificates: action.detail.orderCertificates,
      takenCodes: action.detail.takenCodes,
      pickedInDraft: true,
      signerHint: parsed.signers.length > 0 ? parsed.signers : null,
      signerWarningDismissed: false,
    }),
    errors: withoutKeys(state.errors, ["order", "lineItem"]),
  };
  const named = fillsSigners ? withSignerNames(picked, parsed.signers) : picked;
  const coded = pickCode(before, named, action.order.name);
  const signerFill: FillKey[] = fillsSigners
    ? [parsed.signers.length === 1 ? "signer" : "signers"]
    : [];
  const codeFill: FillKey[] = coded.draft.code !== before.code ? ["code"] : [];

  return withDraft(coded, {
    filled: [...item.filled, ...product.filled, ...signerFill, ...codeFill],
  });
}
