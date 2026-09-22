// One JSON line per event, for `wrangler tail` and Workers Logs. Entries never
// carry secrets, request headers or payload bodies.

export function log(level: "info" | "warn" | "error", entry: Record<string, unknown>): void {
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
