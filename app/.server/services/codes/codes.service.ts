import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { codeError, normalizeRawCode } from "~/features/codes/utils/code.utils";
import type { TeamDictionary } from "~/features/codes/types/code-generator.types";
import {
  buildTeamDictionary,
  learnCodePrefix,
} from "~/features/codes/utils/team-dictionary.utils";
import type { CodeCheckResult } from "~/features/codes/types/codes.types";
import { signerSummary } from "~/features/signers/utils/signer-text.utils";
import {
  codeHistory,
  findCodeOwner,
  historyStamp,
} from "~/.server/repositories/certificate-codes.repository";
import { getShopInfo } from "~/.server/services/shop/shop-info.service";

const dictionaries = new Map<
  string,
  { stamp: string; dictionary: TeamDictionary }
>();

export async function getCodeDictionary(
  context: AdminContext,
): Promise<TeamDictionary> {
  // The stamp is read before the history: a write in between costs one rebuild, never a stale entry.
  const stamp = await historyStamp(context.shop);
  const cached = dictionaries.get(context.shop);

  if (cached?.stamp === stamp) {
    return cached.dictionary;
  }

  const learned = buildTeamDictionary(await codeHistory(context.shop));

  if (learned.prefix !== "") {
    dictionaries.set(context.shop, { stamp, dictionary: learned });

    return learned;
  }

  const shopInfo = await getShopInfo(context);
  const dictionary = {
    ...learned,
    prefix: learnCodePrefix([], shopInfo?.name ?? ""),
  };

  // Without the shop name the prefix is empty, so the next request asks Shopify again.
  if (shopInfo !== null) {
    dictionaries.set(context.shop, { stamp, dictionary });
  }

  return dictionary;
}

export function dropCodeDictionary(shop: string): void {
  dictionaries.delete(shop);
}

export async function checkCode(
  shop: string,
  raw: string,
  excludeId?: string,
): Promise<CodeCheckResult> {
  const code = normalizeRawCode(raw);
  const error = codeError(code);

  if (error !== null) {
    return { code, error, available: false, usedBy: null };
  }

  const owner = await findCodeOwner(shop, code, excludeId);

  return {
    code,
    error: null,
    available: owner === null,
    usedBy: owner && {
      id: owner.id,
      signers: signerSummary(owner.signerNames),
      item: owner.item,
    },
  };
}
