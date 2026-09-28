import { describe, expect, it } from "vitest";
import { codeError, normalizeCode } from "~/features/codes/utils/code.utils";
import fixture from "../../tests/fixtures/legacy-certificates.fixture.json";
import {
  backfillOrderName,
  isBackfillablePrefix,
  learnOrderNumberModel,
} from "./legacy-order-names.utils";

const fixtureCodes = (fixture as { certificate_verification?: string }[])
  .map((record) =>
    normalizeCode(
      (record.certificate_verification ?? "").replace(/\u00a0/g, " ").trim(),
    ),
  )
  .filter((code) => code !== "" && codeError(code) === null);

describe("order number model and backfill (spec §9.3)", () => {
  const model = learnOrderNumberModel(fixtureCodes);

  it("learns the modal length and Tukey far-out fences from the fixture", () => {
    expect(fixtureCodes).toHaveLength(373);
    expect(model).toEqual({ digits: 6, low: 140051, high: 143082 });
    expect(learnOrderNumberModel([])).toBeNull();
  });

  it("backfills only after symbols followed by digits", () => {
    expect(isBackfillablePrefix("")).toBe(true);
    expect(isBackfillablePrefix("#")).toBe(true);
    expect(isBackfillablePrefix("#14")).toBe(true);
    expect(isBackfillablePrefix("EN")).toBe(false);
    expect(isBackfillablePrefix("#EN")).toBe(false);
  });

  it.each([
    ["IS141909ARS0", "#", "", { ok: true, orderName: "#141909" }],
    ["IS141909ARS0", "#14", "", { ok: true, orderName: "#141909" }],
    ["IS141909ARS0", "", "", { ok: true, orderName: "141909" }],
    ["IS141909ARS0", "#14", "-UK", { ok: true, orderName: "#141909-UK" }],
    ["IS141909ARS0", "EN", "", { ok: false, reason: "prefix_mismatch" }],
    ["IS141909ARS0", "#15", "", { ok: false, reason: "prefix_mismatch" }],
    ["IS7328921MUGG", "#", "", { ok: false, reason: "implausible_number" }],
    ["IS196253SAFM", "#", "", { ok: false, reason: "implausible_number" }],
    ["ABCD", "#", "", { ok: false, reason: "no_number" }],
  ])("%s with prefix %j suffix %j", (code, prefix, suffix, result) =>
    expect(backfillOrderName(code, model, prefix, suffix)).toEqual(result),
  );

  it("backfills 353 distinct certificates and reports the 18 of §9.3", () => {
    const unique = [...new Set(fixtureCodes)];
    const failed = unique.filter(
      (code) => !backfillOrderName(code, model, "#", "").ok,
    );
    expect(unique.length - failed.length).toBe(353);
    expect(failed.sort()).toEqual(
      [
        "AS988123MBN",
        "DBNL040193",
        "DBNL4919F",
        "EXC100612",
        "EXC98102",
        "IS102243EXC",
        "IS126828MBNL88",
        "IS14736DBA",
        "IS196249ASM",
        "IS196253MBM",
        "IS196253SAFM",
        "IS196255RGAM",
        "IS196260WSIM",
        "IS198765RKM",
        "IS7328921MUGG",
        "IS980108WWA",
        "IS982628RGNL88",
        "MVB040188",
      ].sort(),
    );
    expect(backfillOrderName("IS141909ARS0", null, "#", "")).toEqual({
      ok: false,
      reason: "implausible_number",
    });
  });
});
