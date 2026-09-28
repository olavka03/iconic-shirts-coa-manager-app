import { z } from "zod";
import { codeError, normalizeCode } from "~/features/codes/utils/code.utils";
import type { FieldErrors } from "~/shared/types/api.types";
import { SUMMARY_ITEM_MAX } from "~/shared/constants/certificate-summary.constants";
import { truncateText } from "~/shared/utils/format.utils";
import type { MediaKind } from "~/features/media/types/media.types";
import {
  isStorableHttpsUrl,
  MEDIA_FILE_TYPES,
} from "~/features/media/utils/media.utils";
import { foldText } from "~/features/certificates/utils/search-text.utils";
import {
  ITEM_MAX,
  LINE_ITEM_TITLE_MAX,
  LOCATION_MAX,
  NOTES_MAX,
  ORDER_NAME_MAX,
  PRODUCT_TITLE_MAX,
  SIGNER_NAME_MAX,
  SIGNERS_MAX,
} from "~/features/certificates/constants/certificate-limits.constants";
import {
  isNotFuture,
  isValidDayIso,
  isValidMonthIso,
} from "~/shared/utils/signing-date.utils";

export const SCHEMA_MESSAGES = {
  orderRequired: "Select an order.",
  lineItemRequired: "Select the item this certificate is for.",
  itemRequired: "Enter the item name.",
  itemTooLong: "Use 200 characters or fewer.",
  singleLine: "Use a single line.",
  signerName: "Enter the signer's name.",
  signerTooLong: "Use 120 characters or fewer.",
  signerRepeated: "This signer is already listed.",
  signersMax: "You can add up to 50 signers.",
  locationTooLong: "Use 150 characters or fewer.",
  notesTooLong: "Use 2,000 characters or fewer.",
  dateFuture: "Date signed can't be in the future.",
  dateInvalid: "Enter a valid date.",
  urlHttps: "Enter a link that starts with https://",
} as const;

const SingleLine = (maxLength: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(maxLength, tooLong)
    .refine((text) => !/[\r\n]/.test(text), SCHEMA_MESSAGES.singleLine);

const SigningDateSchema = z
  .discriminatedUnion("precision", [
    z.object({
      precision: z.literal("DAY"),
      iso: z.string().refine(isValidDayIso, SCHEMA_MESSAGES.dateInvalid),
    }),
    z.object({
      precision: z.literal("MONTH"),
      iso: z.string().refine(isValidMonthIso, SCHEMA_MESSAGES.dateInvalid),
    }),
  ])
  .refine((date) => isNotFuture(date, new Date()), SCHEMA_MESSAGES.dateFuture);

const SignerInput = z.object({
  name: SingleLine(SIGNER_NAME_MAX, SCHEMA_MESSAGES.signerTooLong).pipe(
    z.string().min(1, SCHEMA_MESSAGES.signerName),
  ),
  date: SigningDateSchema.nullable(),
  location: SingleLine(LOCATION_MAX, SCHEMA_MESSAGES.locationTooLong)
    .transform((location) => location || null)
    .nullable(),
});

const Media = (kind: MediaKind) =>
  z.discriminatedUnion("source", [
    z.object({
      source: z.literal("file"),
      fileId: z
        .string()
        .regex(new RegExp(`^gid://shopify/${MEDIA_FILE_TYPES[kind]}/\\d+$`)),
    }),
    z.object({
      source: z.literal("url"),
      url: z
        .string()
        .trim()
        .refine(isStorableHttpsUrl, SCHEMA_MESSAGES.urlHttps),
    }),
  ]);

const Gid = (type: "Order" | "LineItem") =>
  z.string().regex(new RegExp(`^gid://shopify/${type}/\\d{1,20}$`));

function buildSchema(options: { itemRequired: boolean }) {
  const item = options.itemRequired
    ? SingleLine(ITEM_MAX, SCHEMA_MESSAGES.itemTooLong).pipe(
        z.string().min(1, SCHEMA_MESSAGES.itemRequired),
      )
    : SingleLine(ITEM_MAX, SCHEMA_MESSAGES.itemTooLong);

  return z
    .object({
      code: z
        .string()
        .transform(normalizeCode)
        .superRefine((code, context) => {
          const message = codeError(code);

          if (message) {
            context.addIssue({ code: "custom", message });
          }
        }),
      // Both null on update keeps the stored link: a link can be replaced, never removed.
      order: z
        .object({
          id: Gid("Order"),
          name: SingleLine(ORDER_NAME_MAX, SCHEMA_MESSAGES.orderRequired).pipe(
            z.string().min(1, SCHEMA_MESSAGES.orderRequired),
          ),
        })
        .nullable(),
      lineItem: z
        .object({
          id: Gid("LineItem"),
          title: z
            .string()
            .trim()
            .max(LINE_ITEM_TITLE_MAX)
            .pipe(z.string().min(1)),
        })
        .nullable(),
      item,
      productId: z
        .string()
        .regex(/^gid:\/\/shopify\/Product\/\d+$/)
        .nullable(),
      // What the product picker returned, used only when the server can't read the product.
      productHint: z
        .object({
          title: z.string().trim().max(PRODUCT_TITLE_MAX),
          imageUrl: z.string().refine(isStorableHttpsUrl).nullable(),
        })
        .nullable()
        .default(null),
      photo: Media("photo").nullable(),
      video: Media("video").nullable(),
      notes: z
        .string()
        .transform((notes) => notes.replace(/\r\n?/g, "\n").trim())
        .pipe(z.string().max(NOTES_MAX, SCHEMA_MESSAGES.notesTooLong)),
      signers: z
        .array(SignerInput)
        .min(1, SCHEMA_MESSAGES.signerName)
        .max(SIGNERS_MAX, SCHEMA_MESSAGES.signersMax),
    })
    .superRefine((input, context) => {
      const seen = new Set<string>();

      input.signers.forEach((signer, index) => {
        const key = foldText(signer.name);

        if (seen.has(key)) {
          context.addIssue({
            code: "custom",
            message: SCHEMA_MESSAGES.signerRepeated,
            path: ["signers", index, "name"],
          });
        }

        seen.add(key);
      });
    })
    .superRefine((input, context) => {
      if (input.order && !input.lineItem) {
        context.addIssue({
          code: "custom",
          message: SCHEMA_MESSAGES.lineItemRequired,
          path: ["lineItem"],
        });
      }

      if (input.lineItem && !input.order) {
        context.addIssue({
          code: "custom",
          message: SCHEMA_MESSAGES.orderRequired,
          path: ["order"],
        });
      }
    });
}

export const CertificateInputSchema = buildSchema({ itemRequired: true });

export const CreateCertificateInputSchema = CertificateInputSchema.superRefine(
  (input, context) => {
    if (input.order === null) {
      context.addIssue({
        code: "custom",
        message: SCHEMA_MESSAGES.orderRequired,
        path: ["order"],
      });
    }
  },
);

// Imported legacy records may have no item name.
export const ImportCertificateInputSchema = buildSchema({
  itemRequired: false,
});

export type CertificateInput = z.output<typeof CertificateInputSchema>;

// The form shows order, line item and media issues on the whole field, and a date's issues on the date input.
function issueToFieldError(issue: {
  path: PropertyKey[];
  message: string;
}): [string, string] {
  const path = issue.path.map(String);
  const nested = path.length > 1;

  if (nested && path[0] === "order") {
    return ["order", SCHEMA_MESSAGES.orderRequired];
  }

  if (nested && path[0] === "lineItem") {
    return ["lineItem", SCHEMA_MESSAGES.lineItemRequired];
  }

  if (nested && (path[0] === "photo" || path[0] === "video")) {
    return [path[0], issue.message];
  }

  if (path[0] === "signers" && path[2] === "date" && path.length > 3) {
    return [path.slice(0, 3).join("."), issue.message];
  }

  return [path.join("."), issue.message];
}

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const [key, message] = issueToFieldError(issue);

    if (!Object.hasOwn(fieldErrors, key)) {
      fieldErrors[key] = message;
    }
  }

  return fieldErrors;
}

export function codeConflictMessage(usedBy: {
  signers: string;
  item: string;
}): string {
  return usedBy.item
    ? `This code is already used for ${usedBy.signers}, ${truncateText(usedBy.item, SUMMARY_ITEM_MAX)}.`
    : `This code is already used for ${usedBy.signers}.`;
}
