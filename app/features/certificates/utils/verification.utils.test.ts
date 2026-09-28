import { describe, expect, it } from "vitest";
import type { SignerLike } from "~/features/signers/utils/signer-text.utils";
import {
  toVerificationPayload,
  type VerificationSource,
} from "./verification.utils";

const MBRGN: VerificationSource = {
  code: "IS141595MBRGN",
  item: "Netherlands Home Shirt - 1988 Retro",
  notes: "",
  photoUrl:
    "https://cdn.shopify.com/s/files/1/0913/0226/5159/files/Basten_-_Gullit_-_1988.png?v=1780492281",
  videoUrl: null,
  signers: [
    {
      name: "Marco van Basten",
      date: { precision: "DAY", iso: "2023-11-21" },
      location: "Utrecht, Netherlands",
    },
    {
      name: "Ruud Gullit",
      date: { precision: "DAY", iso: "2023-10-19" },
      location: "London, United Kingdom",
    },
  ],
};

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(allKeys);
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) => [
      key,
      ...allKeys(nested),
    ]);
  }

  return [];
}

describe("toVerificationPayload (spec §10.4)", () => {
  it("builds the MBRGN example exactly", () => {
    expect(toVerificationPayload(MBRGN)).toStrictEqual({
      certificate_verification: "IS141595MBRGN",
      signed: "Marco van Basten and Ruud Gullit",
      shirt: "Netherlands Home Shirt - 1988 Retro",
      location:
        "Utrecht, Netherlands (Marco van Basten); London, United Kingdom (Ruud Gullit)",
      date: "21 November 2023 (Marco van Basten); 19 October 2023 (Ruud Gullit)",
      photo:
        "https://cdn.shopify.com/s/files/1/0913/0226/5159/files/Basten_-_Gullit_-_1988.png?v=1780492281",
      video: "",
      notes: "",
      signers: [
        {
          name: "Marco van Basten",
          date: "21 November 2023",
          date_iso: "2023-11-21",
          date_precision: "day",
          location: "Utrecht, Netherlands",
        },
        {
          name: "Ruud Gullit",
          date: "19 October 2023",
          date_iso: "2023-10-19",
          date_precision: "day",
          location: "London, United Kingdom",
        },
      ],
    });
  });

  it("keeps the legacy key order", () => {
    expect(Object.keys(toVerificationPayload(MBRGN))).toEqual([
      "certificate_verification",
      "signed",
      "shirt",
      "location",
      "date",
      "photo",
      "video",
      "notes",
      "signers",
    ]);
  });

  it("writes month and missing dates as strings", () => {
    const signers: SignerLike[] = [
      {
        name: "Didier Drogba",
        date: { precision: "MONTH", iso: "2026-04" },
        location: null,
      },
      { name: "Squad", date: null, location: null },
    ];
    const payload = toVerificationPayload({ ...MBRGN, signers });
    expect(payload.signers).toStrictEqual([
      {
        name: "Didier Drogba",
        date: "April 2026",
        date_iso: "2026-04",
        date_precision: "month",
        location: "",
      },
      {
        name: "Squad",
        date: "",
        date_iso: "",
        date_precision: "",
        location: "",
      },
    ]);
    expect(payload.date).toBe("April 2026 (Didier Drogba)");
    expect(payload.location).toBe("");
  });

  it("exposes no order, product or internal fields", () => {
    const keys = allKeys(toVerificationPayload(MBRGN));
    expect(keys.length).toBeGreaterThan(9);
    expect(
      keys.filter((key) =>
        /order|line_?item|lineItem|^id$|product|metaobject|legacy/i.test(key),
      ),
    ).toEqual([]);
  });
});
