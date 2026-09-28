import { normalizeCode } from "~/features/codes/utils/code.utils";
import { foldText } from "~/features/certificates/utils/search-text.utils";
import type {
  AddIssue,
  Issue,
  LegacyRecord,
  ParsedLegacy,
} from "./legacy-import.types";
import { applyOverrides, LEGACY_OVERRIDES } from "./legacy-overrides.utils";
import { parseSigners, recordText } from "./legacy-signers.utils";

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);

    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function parseLegacyRecord(
  raw: LegacyRecord,
  options: { overrides?: boolean; now?: Date } = {},
): ParsedLegacy {
  const now = options.now ?? new Date();
  const issues: Issue[] = [];
  const add: AddIssue = (severity, code, message) =>
    void issues.push({ severity, code, message });
  const patched = applyOverrides(
    raw,
    options.overrides === false ? [] : LEGACY_OVERRIDES,
  );
  const record = patched.record;

  for (const override of patched.applied) {
    add(
      "info",
      "OVERRIDE_APPLIED",
      `${override.field}: "${override.from}" → "${override.to}". ${override.reason}`,
    );
  }

  for (const note of patched.notes) {
    add("info", "NOTE", note);
  }

  const code = normalizeCode(recordText(record, "certificate_verification"));
  // Two records hold their code in the lowercase `item` key.
  const lowerItem = recordText(record, "item");
  const item =
    recordText(record, "shirt") ||
    recordText(record, "Item") ||
    (normalizeCode(lowerItem) !== code ? lowerItem : "");

  if (!item) {
    add("warning", "ITEM_MISSING", "No item. Imported with an empty item.");
  }

  const location = recordText(record, "location");

  if (location && item && foldText(location) === foldText(item)) {
    add(
      "warning",
      "LOCATION_IS_ITEM",
      `Location equals the item: "${location}".`,
    );
  }

  const photoUrl = parsePhoto(recordText(record, "photo"), add);
  const videoUrl = parseVideo(recordText(record, "video"), add);
  const { signers, pattern } = parseSigners(record, now, add);

  if (signers.length === 0) {
    add(
      "error",
      "SIGNERS_UNPARSED",
      `Couldn't read signers from "${recordText(record, "signed")}".`,
    );
  }

  const notes = typeof record.notes === "string" ? record.notes : "";

  return {
    code,
    item,
    notes,
    photoUrl,
    videoUrl,
    signers,
    pattern,
    issues,
    overrides: patched.applied,
  };
}

function parsePhoto(value: string, add: AddIssue): string | null {
  if (!value) {
    return null;
  }

  const url = httpsUrl(value);

  if (!url) {
    add("warning", "PHOTO_NOT_URL", `Photo "${value}" is not a link. Dropped.`);

    return null;
  }

  if (url.hostname !== "cdn.shopify.com") {
    add("info", "PHOTO_NOT_SHOPIFY_CDN", `Photo host ${url.hostname}. Kept.`);
  }

  return value;
}

function parseVideo(value: string, add: AddIssue): string | null {
  if (!value) {
    return null;
  }

  const url = httpsUrl(value);

  if (!url) {
    add("warning", "VIDEO_NOT_URL", `Video "${value}" is not a link. Dropped.`);

    return null;
  }

  // The pathname, because these URLs carry a ?v= query.
  if (/\.(png|jpe?g|webp|gif)$/i.test(url.pathname)) {
    add("warning", "VIDEO_IS_IMAGE", "Video is an image file. Dropped.");

    return null;
  }

  return value;
}
