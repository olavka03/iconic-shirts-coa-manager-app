import type { ErrorBody } from "~/shared/types/api.types";

export type UsedBy = { id: string; signers: string; item: string };

export type CodeCheckResult = {
  code: string;
  error: string | null;
  available: boolean;
  usedBy: UsedBy | null;
};

export type CodeCheckResponse = CodeCheckResult | ErrorBody;
