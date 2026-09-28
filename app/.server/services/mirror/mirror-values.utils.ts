import {
  COA_TYPE,
  type DefinitionField,
  type DefinitionInput,
  type EntryValue,
} from "~/.server/gateways/metaobjects.gateway";
import { isStorableHttpsUrl } from "~/features/media/utils/media.utils";
import {
  composeLegacyText,
  type SignerLike,
} from "~/features/signers/utils/signer-text.utils";
import type { MirrorSource } from "~/.server/repositories/certificate.types";

export const DEFINITION_FIELDS: readonly DefinitionField[] = [
  {
    key: "certificate_id",
    name: "Certificate ID",
    type: "single_line_text_field",
  },
  {
    key: "code",
    name: "Code",
    type: "single_line_text_field",
    required: true,
  },
  { key: "item", name: "Item", type: "single_line_text_field" },
  { key: "signed", name: "Signed by", type: "single_line_text_field" },
  { key: "date", name: "Date signed", type: "single_line_text_field" },
  { key: "location", name: "Location", type: "single_line_text_field" },
  { key: "signers", name: "Signers", type: "json" },
  { key: "photo", name: "Photo", type: "url" },
  {
    key: "photo_file_id",
    name: "Photo file ID",
    type: "single_line_text_field",
  },
  { key: "photo_error", name: "Photo error", type: "single_line_text_field" },
  { key: "video", name: "Video", type: "url" },
  {
    key: "video_file_id",
    name: "Video file ID",
    type: "single_line_text_field",
  },
  { key: "video_preview", name: "Video preview", type: "url" },
  { key: "video_error", name: "Video error", type: "single_line_text_field" },
  { key: "notes", name: "Notes", type: "multi_line_text_field" },
  { key: "order_id", name: "Order ID", type: "single_line_text_field" },
  { key: "order_name", name: "Order", type: "single_line_text_field" },
  { key: "line_item_id", name: "Line item ID", type: "single_line_text_field" },
  {
    key: "line_item_title",
    name: "Ordered item",
    type: "single_line_text_field",
  },
  { key: "product", name: "Product", type: "product_reference" },
  {
    key: "product_title",
    name: "Product title",
    type: "single_line_text_field",
  },
  { key: "product_image", name: "Product image", type: "url" },
  { key: "created_at", name: "Created", type: "date_time" },
  { key: "updated_at", name: "Last updated", type: "date_time" },
];

export const DEFINITION_INPUT: DefinitionInput = {
  type: COA_TYPE,
  name: "COA Certificate",
  description:
    "Managed by the COA Manager app. Edit certificates in the app; changes made here are overwritten.",
  displayNameKey: "code",
  access: { storefront: "NONE" },
  fieldDefinitions: [...DEFINITION_FIELDS],
};

export const EXCLUDED_COLUMNS: Readonly<
  Record<"shop" | "searchText" | "latestSignedOn" | "version", string>
> = {
  shop: "the entry lives in that shop",
  searchText: "derived from mapped values",
  latestSignedOn: "derived from the signers",
  version: "mirror bookkeeping",
};

// signed, date, location and signers come from the signer rows, not from a Certificate column.
export const COLUMN_KEYS: Readonly<Record<string, readonly string[]>> = {
  id: ["certificate_id"],
  code: ["code"],
  item: ["item"],
  notes: ["notes"],
  orderId: ["order_id"],
  orderName: ["order_name"],
  lineItemId: ["line_item_id"],
  lineItemTitle: ["line_item_title"],
  photoUrl: ["photo"],
  photoFileId: ["photo_file_id"],
  videoUrl: ["video"],
  videoFileId: ["video_file_id"],
  videoPreviewUrl: ["video_preview"],
  photoError: ["photo_error"],
  videoError: ["video_error"],
  productId: ["product"],
  productTitle: ["product_title"],
  productImageUrl: ["product_image"],
  createdAt: ["created_at"],
  updatedAt: ["updated_at"],
};

const PRECISION = { DAY: "day", MONTH: "month" } as const;

const toIsoSeconds = (date: Date) =>
  date.toISOString().replace(/\.\d{3}Z$/, "Z");
const httpsOrNull = (url: string | null) =>
  url !== null && isStorableHttpsUrl(url) ? url : null;
const emptyToNull = (value: string | null) => (value === "" ? null : value);

function signerValues(signers: readonly SignerLike[]): EntryValue {
  return signers.map((signer) => ({
    name: signer.name,
    date_iso: signer.date?.iso ?? null,
    date_precision: signer.date ? PRECISION[signer.date.precision] : null,
    location: emptyToNull(signer.location),
  }));
}

// values is a full replacement, so an empty column is left out and the entry's key is cleared.
export function toMetaobjectValues(
  certificate: MirrorSource,
): Record<string, EntryValue> {
  const text = composeLegacyText(certificate.signers);
  const values: Record<string, EntryValue> = {
    certificate_id: certificate.id,
    code: certificate.code,
    item: certificate.item,
    signed: text.signed,
    date: text.date,
    location: text.location,
    signers: signerValues(certificate.signers),
    photo: httpsOrNull(certificate.photoUrl),
    photo_file_id: certificate.photoFileId,
    photo_error: certificate.photoError,
    video: httpsOrNull(certificate.videoUrl),
    video_file_id: certificate.videoFileId,
    video_preview: httpsOrNull(certificate.videoPreviewUrl),
    video_error: certificate.videoError,
    notes: certificate.notes,
    order_id: certificate.orderId,
    order_name: certificate.orderName,
    line_item_id: certificate.lineItemId,
    line_item_title: certificate.lineItemTitle,
    product: certificate.productId,
    product_title: certificate.productTitle,
    product_image: httpsOrNull(certificate.productImageUrl),
    created_at: toIsoSeconds(certificate.createdAt),
    updated_at: toIsoSeconds(certificate.updatedAt),
  };

  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== null && value !== "",
    ),
  );
}

export function diffDefinition(
  existing: readonly { key: string; type: string }[],
): {
  create: DefinitionField[];
  conflicts: { key: string; expected: string; actual: string }[];
} {
  const types = new Map(existing.map((field) => [field.key, field.type]));

  return {
    create: DEFINITION_FIELDS.filter((field) => !types.has(field.key)),
    conflicts: DEFINITION_FIELDS.flatMap((field) => {
      const actual = types.get(field.key);

      return actual === undefined || actual === field.type
        ? []
        : [{ key: field.key, expected: field.type, actual }];
    }),
  };
}
