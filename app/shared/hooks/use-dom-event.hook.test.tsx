import { render } from "@testing-library/react";
import { useRef } from "react";
import { expect, it, vi } from "vitest";
import { useDomEvent } from "./use-dom-event.hook";

function Probe({ onNext }: { onNext: (event: Event) => void }) {
  const ref = useRef<HTMLElementTagNameMap["s-table"]>(null);
  useDomEvent(ref, "nextpage", onNext);

  return <s-table ref={ref} />;
}

function SwappingProbe({
  rows,
  tableKey = "a",
  onNext,
}: {
  rows: boolean;
  tableKey?: string;
  onNext: (event: Event) => void;
}) {
  const ref = useRef<HTMLElementTagNameMap["s-table"]>(null);
  useDomEvent(ref, "nextpage", onNext);

  return rows ? <s-table key={tableKey} ref={ref} /> : <s-box />;
}

it("attaches one listener for a Polaris custom event and removes it on unmount", () => {
  const onNext = vi.fn();
  const { container, unmount } = render(<Probe onNext={onNext} />);
  const table = container.querySelector("s-table")!;
  table.dispatchEvent(new Event("nextpage"));
  expect(onNext).toHaveBeenCalledTimes(1);
  unmount();
  table.dispatchEvent(new Event("nextpage"));
  expect(onNext).toHaveBeenCalledTimes(1);
});

it("binds an element that mounts after the first render", () => {
  const onNext = vi.fn();
  const { container, rerender } = render(
    <SwappingProbe rows={false} onNext={onNext} />,
  );
  rerender(<SwappingProbe rows onNext={onNext} />);
  container.querySelector("s-table")!.dispatchEvent(new Event("nextpage"));
  expect(onNext).toHaveBeenCalledTimes(1);
});

it("moves the listener to a replacement element", () => {
  const onNext = vi.fn();
  const { container, rerender } = render(
    <SwappingProbe rows tableKey="a" onNext={onNext} />,
  );
  const first = container.querySelector("s-table")!;
  rerender(<SwappingProbe rows tableKey="b" onNext={onNext} />);
  const second = container.querySelector("s-table")!;
  expect(second).not.toBe(first);
  first.dispatchEvent(new Event("nextpage"));
  expect(onNext).not.toHaveBeenCalled();
  second.dispatchEvent(new Event("nextpage"));
  expect(onNext).toHaveBeenCalledTimes(1);
});

it("rebinds after the empty state replaces the element and the rows come back", () => {
  const onNext = vi.fn();
  const { container, rerender } = render(
    <SwappingProbe rows onNext={onNext} />,
  );
  const first = container.querySelector("s-table")!;
  rerender(<SwappingProbe rows={false} onNext={onNext} />);
  first.dispatchEvent(new Event("nextpage"));
  expect(onNext).not.toHaveBeenCalled();
  rerender(<SwappingProbe rows onNext={onNext} />);
  container.querySelector("s-table")!.dispatchEvent(new Event("nextpage"));
  expect(onNext).toHaveBeenCalledTimes(1);
});

it("calls the latest handler, once per event", () => {
  const first = vi.fn();
  const second = vi.fn();
  const { container, rerender } = render(<Probe onNext={first} />);
  rerender(<Probe onNext={second} />);
  rerender(<Probe onNext={second} />);
  container.querySelector("s-table")!.dispatchEvent(new Event("nextpage"));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

it("fires once per event under StrictMode", () => {
  const onNext = vi.fn();
  const { container, rerender } = render(
    <SwappingProbe rows={false} onNext={onNext} />,
    { reactStrictMode: true },
  );
  rerender(<SwappingProbe rows onNext={onNext} />);
  container.querySelector("s-table")!.dispatchEvent(new Event("nextpage"));
  expect(onNext).toHaveBeenCalledTimes(1);
});
