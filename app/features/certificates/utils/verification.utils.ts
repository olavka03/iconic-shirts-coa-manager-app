import { formatDateLong } from "~/shared/utils/format.utils";
import {
  composeLegacyText,
  type SignerLike,
} from "~/features/signers/utils/signer-text.utils";

// Public storefront shape: deliberately no order, line item, id, product or metaobject fields.
export type VerificationSource = {
  code: string;
  item: string;
  notes: string;
  photoUrl: string | null;
  videoUrl: string | null;
  signers: SignerLike[];
};

export type VerificationPayload = {
  certificate_verification: string;
  signed: string;
  shirt: string;
  location: string;
  date: string;
  photo: string;
  video: string;
  notes: string;
  signers: {
    name: string;
    date: string;
    date_iso: string;
    date_precision: "day" | "month" | "";
    location: string;
  }[];
};

export type VerifyResponse =
  | { found: true; certificate: VerificationPayload }
  | { found: false; error?: "rate_limited" };

const PRECISION = { DAY: "day", MONTH: "month" } as const;

// Key order is the legacy JSON's; the storefront page reads these keys.
export function toVerificationPayload(
  source: VerificationSource,
): VerificationPayload {
  const text = composeLegacyText(source.signers);

  return {
    certificate_verification: source.code,
    signed: text.signed,
    shirt: source.item,
    location: text.location,
    date: text.date,
    photo: source.photoUrl ?? "",
    video: source.videoUrl ?? "",
    notes: source.notes,
    signers: source.signers.map((signer) => ({
      name: signer.name,
      date: signer.date ? formatDateLong(signer.date) : "",
      date_iso: signer.date?.iso ?? "",
      date_precision: signer.date ? PRECISION[signer.date.precision] : "",
      location: signer.location ?? "",
    })),
  };
}
