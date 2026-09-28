export type LogFields = Record<
  string,
  string | number | boolean | null | undefined
>;
type Level = "info" | "warn" | "error";
export type LogLine = LogFields & { level: Level; event: string; time: string };

let sink: ((line: LogLine) => void) | null = null;

export function setLogSink(next: ((line: LogLine) => void) | null): void {
  sink = next;
}

function write(level: Level, event: string, fields: LogFields = {}): void {
  const line: LogLine = {
    ...fields,
    level,
    event,
    time: new Date().toISOString(),
  };
  sink?.(line);

  if (process.env.LOG_LEVEL === "silent") {
    return;
  }

  (level === "info" ? process.stdout : process.stderr).write(
    `${JSON.stringify(line)}\n`,
  );
}

// One JSON line per event. Never pass tokens, customer data, line item titles, codes or IPs.
export const log = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};

export function errorName(error: unknown): string {
  if (error instanceof Response) {
    return `http_${error.status}`;
  }

  if (error instanceof Error) {
    // Shopify's library errors (InvalidJwtError, HttpResponseError, ...) never set `name`.
    const name =
      error.name === "Error" ? error.constructor.name || "Error" : error.name;
    const code = "code" in error ? error.code : undefined;

    return code === undefined ? name : `${name}:${String(code)}`;
  }

  return typeof error;
}

export async function timed<Value>(
  run: () => Promise<Value>,
): Promise<{ value: Value; elapsedMs: number }> {
  const startedAt = performance.now();
  const value = await run();

  return { value, elapsedMs: Math.round(performance.now() - startedAt) };
}
