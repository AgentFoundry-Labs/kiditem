/**
 * Secret detection regex patterns used by `scrubSecrets`.
 *
 * Each entry is scanned independently. Patterns use the global flag so that
 * `String.prototype.replace` swaps out every occurrence in one pass.
 */
export const SECRET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'openai_api_key', re: /sk-[A-Za-z0-9_\-]{20,}/g },
  { name: 'bearer_token', re: /(?:^|\s)Bearer\s+[A-Za-z0-9_\-\.]+/gi },
  { name: 'aws_access_key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'gemini_api_key', re: /AIza[0-9A-Za-z_\-]{35}/g },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_\-]+?\.eyJ[A-Za-z0-9_\-]+?\.[A-Za-z0-9_\-]+/g },
  { name: 'pem_block', re: /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g },
  { name: 'wing_cookie', re: /WING[A-Z_]*SESSION[A-Za-z0-9_=\-]*/gi },
  { name: 'basic_auth', re: /Basic\s+[A-Za-z0-9+/=]{20,}/gi },
];

/**
 * Object keys whose values should be fully redacted regardless of content.
 * Comparisons are case-insensitive — callers must lowercase keys before lookup.
 */
export const SENSITIVE_FIELD_KEYS: ReadonlySet<string> = new Set([
  'password',
  'api_key',
  'apikey',
  'secret',
  'token',
  'authorization',
  'cookie',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'private_key',
  'privatekey',
  'client_secret',
  'clientsecret',
]);
