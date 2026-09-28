import type { MediaKind, MediaValue } from "./media.types";

export type MediaFieldProps = {
  kind: MediaKind;
  value: MediaValue | null;
  serverError: string | null;
  onChange(value: MediaValue | null): void;
  onBusyChange(blocking: boolean): void;
  discardToken: number;
};

export type MediaFieldActions = {
  pick(): void;
  openUrl(): void;
  addUrl(input: string): void;
  editUrl(): void;
  showCurrent(): void;
  remove(): void;
  markBroken(url: string): void;
};
