/**
 * Scrub credentials out of text that came from outside.
 *
 * Marketplace and browser-extension error strings land on a source run's
 * `errorMessage` and in the operator's alert. This was four byte-identical
 * copies in `orders/`, so the other owners passed provider text through
 * untouched.
 */
export function redact(value: string): string {
  return value.replace(/(api[_-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}
