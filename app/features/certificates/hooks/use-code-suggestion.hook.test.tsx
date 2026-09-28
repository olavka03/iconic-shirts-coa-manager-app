import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formReducer } from "~/features/certificates/reducers/certificate-form.reducer";
import type {
  DateDraft,
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { useCodeSuggestion } from "./use-code-suggestion.hook";
import {
  certificateFormBuilders,
  itemRow,
  pickAction,
} from "../../../../tests/helpers/certificate-form.factory";

beforeEach(() => {
  vi.useFakeTimers();
});

const BAYERN_TITLE =
  "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home";

const { openForm } = certificateFormBuilders();

function pickedCreateState(): FormState {
  return formReducer(
    openForm("create"),
    pickAction("#141002", itemRow(BAYERN_TITLE)),
  );
}

function renderSuggestion(initial: FormState) {
  const dispatch = vi.fn<(action: FormAction) => void>();
  const view = renderHook(
    ({ state }: { state: FormState }) => useCodeSuggestion(state, dispatch),
    { initialProps: { state: initial } },
  );

  return { ...view, dispatch };
}

describe("useCodeSuggestion", () => {
  it("applies the auto code 300 ms after a signer name changes", () => {
    const picked = pickedCreateState();
    const { rerender, dispatch } = renderSuggestion(picked);

    act(() => vi.advanceTimersByTime(1000));

    expect(dispatch).not.toHaveBeenCalled();

    rerender({
      state: formReducer(picked, {
        type: "setSignerName",
        key: picked.draft.signers[0].key,
        value: "Thomas Müller",
      }),
    });
    act(() => vi.advanceTimersByTime(299));

    expect(dispatch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "applyAutoCode" });
  });

  it("waits for the item and the linked product too", () => {
    const picked = pickedCreateState();
    const { rerender, dispatch } = renderSuggestion(picked);
    const retyped = formReducer(picked, {
      type: "setItem",
      value: "Bayern Munich Football Shirt - 2016-17 Home",
    });

    rerender({ state: retyped });
    act(() => vi.advanceTimersByTime(200));
    rerender({
      state: formReducer(retyped, {
        type: "linkProduct",
        product: {
          id: "gid://shopify/Product/101",
          title: BAYERN_TITLE,
          imageUrl: null,
          status: null,
        },
      }),
    });
    act(() => vi.advanceTimersByTime(299));

    expect(dispatch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("ignores dates, locations and notes", () => {
    const picked = pickedCreateState();
    const { rerender, dispatch } = renderSuggestion(picked);
    const key = picked.draft.signers[0].key;
    const date: DateDraft = {
      dayUnknown: false,
      iso: "2025-03-19",
      view: null,
    };

    rerender({
      state: [
        {
          type: "setDate",
          target: { scope: "signer", signerKey: key },
          value: date,
        },
        {
          type: "setLocation",
          target: { scope: "signer", signerKey: key },
          value: "Munich, Germany",
        },
        { type: "setNotes", value: "Signed at the club shop." },
      ].reduce<FormState>(
        (state, action) => formReducer(state, action as FormAction),
        picked,
      ),
    });
    act(() => vi.advanceTimersByTime(1000));

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("never applies a code in manual mode", () => {
    const manual = formReducer(pickedCreateState(), {
      type: "setCode",
      value: "IS141002RL",
    });
    const { rerender, dispatch } = renderSuggestion(manual);

    rerender({
      state: formReducer(manual, {
        type: "setSignerName",
        key: manual.draft.signers[0].key,
        value: "Thomas Müller",
      }),
    });
    act(() => vi.advanceTimersByTime(1000));

    expect(dispatch).not.toHaveBeenCalled();
  });
});
