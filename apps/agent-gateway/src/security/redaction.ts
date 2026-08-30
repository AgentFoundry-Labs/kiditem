const OPAQUE_BEARER = /\b[A-Za-z0-9_-]{43}\b/g;
const BEARER_VALUE = /Bearer\s+[A-Za-z0-9_-]{20,}/gi;
const PROVIDER_DIAGNOSTIC = /(?:^|\n|\b)\s*(?:stderr|error)\b[^\n]*/gi;

/** Converts provider-originated stream text into bounded Gateway event text. */
export function redactForGatewayEvent(value: string, explicitTokens: readonly string[] = []): string {
  let result = value.replace(PROVIDER_DIAGNOSTIC, '\n[provider diagnostics redacted]');
  for (const token of explicitTokens) {
    if (token) result = result.replaceAll(token, '[redacted]');
  }
  result = result.replace(BEARER_VALUE, 'Bearer [redacted]').replace(OPAQUE_BEARER, '[redacted]');
  return truncateUtf8(result, 16_000);
}

/** Provider errors never become unbounded control-plane data. */
export function safeGatewayDiagnostic(_error: unknown): 'gateway_provider_error' {
  return 'gateway_provider_error';
}

export function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength <= maxBytes) return value;
  return bytes.subarray(0, maxBytes).toString('utf8');
}
