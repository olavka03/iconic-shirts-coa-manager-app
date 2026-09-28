import type { SigningDate } from "~/shared/utils/signing-date.utils";

export type SignerValue = {
  name: string;
  date: SigningDate | null;
  location: string;
};
