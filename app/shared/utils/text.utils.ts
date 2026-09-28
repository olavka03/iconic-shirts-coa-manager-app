// \s includes the no-break space, so NBSP runs collapse to one plain space too.
export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
