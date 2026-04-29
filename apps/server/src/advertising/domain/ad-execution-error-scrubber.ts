/**
 * Redacts known secret patterns out of execution error messages before they
 * are persisted to `ExecutionTask.errorMessage` / `AdAction.errorMessage`
 * (and therefore returned to clients). The scrubber runs against the raw
 * worker-reported error string and must remain a pure function so it can be
 * unit-tested and reused outside `AdExecutionService`.
 *
 * Patterns are intentionally conservative — they target high-confidence
 * secret shapes only (API keys, bearer tokens, JWTs, PEM blocks, Wing
 * session cookies, basic-auth blobs). Adding new patterns here applies
 * everywhere the scrubber is invoked.
 */

export const REDACTED_PLACEHOLDER = '[REDACTED]';

const ERROR_SECRET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'openai_api_key', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'bearer_token', re: /(?:^|\s)Bearer\s+[A-Za-z0-9_.-]+/gi },
  { name: 'aws_access_key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'gemini_api_key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]+?\.eyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+/g },
  { name: 'pem_block', re: /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g },
  { name: 'wing_cookie', re: /WING[A-Z_]*SESSION[A-Za-z0-9_=-]*/gi },
  { name: 'basic_auth', re: /Basic\s+[A-Za-z0-9+/=]{20,}/gi },
];

export function scrubExecutionError(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { name, re } of ERROR_SECRET_PATTERNS) {
    out = out.replace(re, (match) => {
      if (name === 'bearer_token') {
        const lead = match.match(/^\s/)?.[0] ?? '';
        return `${lead}${REDACTED_PLACEHOLDER}`;
      }
      return REDACTED_PLACEHOLDER;
    });
  }
  return out;
}
