import { describe, expect, it } from "vitest";
import { pageSkeletonFor } from "./page-skeleton.utils";

const at = (pathname: string, search = "") => ({ pathname, search });
const CERTIFICATE = at(
  "/app/certificates/0192f3a4-5b6c-7d8e-9f01-23456789abcd",
);

describe("pageSkeletonFor", () => {
  it("shows nothing without a pending navigation", () => {
    expect(pageSkeletonFor(at("/app"), undefined)).toBeNull();
  });

  it("keeps the index for a search, filter, sort or page size change", () => {
    expect(pageSkeletonFor(at("/app"), at("/app", "?sort=code"))).toBeNull();
    expect(
      pageSkeletonFor(at("/app", "?view=grid"), at("/app/", "?perPage=50")),
    ).toBeNull();
  });

  it("shows the index skeleton in the view the link asks for", () => {
    expect(pageSkeletonFor(CERTIFICATE, at("/app", "?q=henry"))).toEqual({
      page: "index",
      view: "table",
    });
    expect(pageSkeletonFor(CERTIFICATE, at("/app", "?view=grid"))).toEqual({
      page: "index",
      view: "grid",
    });
    expect(pageSkeletonFor(CERTIFICATE, at("/app/certificates"))).toEqual({
      page: "index",
      view: "table",
    });
  });

  it("shows the certificate skeleton for create, duplicate and edit", () => {
    expect(pageSkeletonFor(at("/app"), at("/app/certificates/new"))).toEqual({
      page: "certificate",
    });
    expect(
      pageSkeletonFor(CERTIFICATE, at("/app/certificates/new", "?duplicate=1")),
    ).toEqual({ page: "certificate" });
    expect(pageSkeletonFor(at("/app/certificates/new"), CERTIFICATE)).toEqual({
      page: "certificate",
    });
  });

  it("shows nothing for pages without a skeleton", () => {
    expect(pageSkeletonFor(at("/app"), at("/auth/login"))).toBeNull();
    expect(
      pageSkeletonFor(at("/app"), at("/app/certificates/new/extra")),
    ).toBeNull();
  });
});
