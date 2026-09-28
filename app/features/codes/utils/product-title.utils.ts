import { splitNames } from "~/features/signers/utils/signer-text.utils";
import { cleanText } from "~/shared/utils/text.utils";

const GROUP_BEFORE_SIGNED =
  /\b(team|squad|triple|double|dual|twin|multi|group|club|players?)[\s-]*$/i;
const QUALIFIER_BEFORE_SIGNED =
  /\s+(hand|personally|authentic(?:ally)?|officially)$/i;

type TitleOptions = { isTeam?: (name: string) => boolean };

function isPersonName(name: string, options: TitleOptions): boolean {
  return (
    !/\d/.test(name) && name.split(" ").length <= 5 && !options.isTeam?.(name)
  );
}

function withSigners(names: string[], item: string) {
  return names.length > 0
    ? { signer: names[0], signers: names, item }
    : { signers: [] as string[], item };
}

// Takes LineItem.title, never LineItem.name (it appends the variant). Rules 1–7 of spec §4.3.1.
export function parseProductTitle(
  title: string,
  options: TitleOptions = {},
): { signer?: string; signers: string[]; item: string } {
  const text = cleanText(title);
  const none = { signers: [] as string[], item: text };

  if (!text) {
    return none;
  }

  const signedBy =
    /^(.*?)[\s\-–—,(]*\b(?:signed|autographed)\s+by\s+([^()\-–—]+?)\)?$/i.exec(
      text,
    );

  if (signedBy && signedBy[1]) {
    return withSigners(splitNames(signedBy[2]), cleanText(signedBy[1]));
  }

  const signedMatch = /^(.*?)\s*\b(signed|autographed)\b\s*(.*)$/i.exec(text);

  if (!signedMatch) {
    return none;
  }

  const left = cleanText(signedMatch[1]);
  const right = cleanText(signedMatch[3]);

  if (!left) {
    return { signers: [], item: right || text };
  }

  if (GROUP_BEFORE_SIGNED.test(left) || /-$/.test(left) || !right) {
    return none;
  }

  const names = splitNames(left.replace(QUALIFIER_BEFORE_SIGNED, ""));
  const people =
    names.length <= 3 && names.every((name) => isPersonName(name, options));

  return people ? withSigners(names, right) : none;
}
