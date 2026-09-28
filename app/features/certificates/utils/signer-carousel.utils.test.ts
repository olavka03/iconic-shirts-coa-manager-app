import { describe, expect, it } from "vitest";
import {
  currentSignerIndex,
  firstInvalidSigner,
  invalidSignerIndexes,
  usesCarousel,
} from "./signer-carousel.utils";

const KEYS = ["s0", "s1", "s2", "s3"];

describe("signer carousel", () => {
  it("starts at three signers", () => {
    expect([1, 2, 3, 13].map(usesCarousel)).toEqual([false, false, true, true]);
  });

  it("follows the current signer's key after a move", () => {
    expect(
      currentSignerIndex(["s1", "s0", "s2"], { key: "s0", index: 0 }),
    ).toBe(1);
  });

  it("falls back to the index, kept within the signers, once the key is gone or unknown", () => {
    expect(
      currentSignerIndex(["s0", "s2", "s3"], { key: "s1", index: 1 }),
    ).toBe(1);
    expect(currentSignerIndex(["s0", "s1"], { key: "s2", index: 2 })).toBe(1);
    expect(currentSignerIndex(KEYS, { key: null, index: 4 })).toBe(3);
    expect(currentSignerIndex(KEYS, { key: null, index: -1 })).toBe(0);
    expect(currentSignerIndex([], { key: null, index: 2 })).toBe(0);
  });

  it("finds the signers with errors and the first of them", () => {
    const errors = {
      code: "Enter a code.",
      "signers.4.name": "Enter the signer's name.",
      "signers.2.location": "Too long.",
      "signers.2.name": "Enter the signer's name.",
    };

    expect([...invalidSignerIndexes(errors)].sort()).toEqual([2, 4]);
    expect(firstInvalidSigner(errors)).toBe(2);
    expect(firstInvalidSigner({ code: "Enter a code." })).toBeNull();
  });
});
