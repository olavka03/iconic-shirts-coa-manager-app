import { describe, expect, it } from "vitest";
import { beginLoading } from "./admin-loading.utils";

describe("beginLoading", () => {
  it("counts an end callback once, however often it is called", () => {
    const endA = beginLoading();
    const endB = beginLoading();

    endA();
    endA();
    expect(shopify.loading).not.toHaveBeenCalledWith(false);

    endB();
    expect(shopify.loading).toHaveBeenLastCalledWith(false);
  });
});
