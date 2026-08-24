import { MAX_RUNNER_OUTPUT_BYTES } from '@kiditem/shared/agent-runtime';

const OPAQUE_BEARER = /\b[A-Za-z0-9_-]{43}\b/g;
const BEARER_VALUE = /Bearer\s+[A-Za-z0-9_-]{20,}/gi;
const STDERR_FRAGMENT = /(?:^|\n|\b)\s*stderr\b[^\n]*/gi;

/** Converts provider-originated text into bounded runner-safe event text. */
export function redactForRunnerEvent(value: string, explicitTokens: readonly string[] = []): string {
  let result = value.replace(STDERR_FRAGMENT, '\n[provider diagnostics redacted]');
  for (const token of explicitTokens) {
    if (token) result = result.replaceAll(token, '[redacted]');
  }
  result = result.replace(BEARER_VALUE, 'Bearer [redacted]').replace(OPAQUE_BEARER, '[redacted]');
  return truncateUtf8(result, MAX_RUNNER_OUTPUT_BYTES);
}

/** Errors are intentionally classified, never serialized with provider text. */
export function safeDiagnostic(_error: unknown): 'provider_runtime_error' {
  return 'provider_runtime_error';
}

/** Tool/shell environments are always token-free, even when provider MCP uses one internally. */
export function stripAttemptTokenFromModelEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { KIDITEM_ATTEMPT_MCP_TOKEN: _discarded, ...safe } = env;
  return safe;
}

export function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength <= maxBytes) return value;
  return bytes.subarray(0, maxBytes).toString('utf8');
}
