import type { OrderDetail } from "./orders.types";

export type DetailState =
  | { status: "idle" }
  | {
      status: "loading" | "missing" | "error" | "no_access";
      openingId: string;
    }
  | { status: "ready"; openingId: string; detail: OrderDetail };
