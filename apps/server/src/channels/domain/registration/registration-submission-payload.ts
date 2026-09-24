export type RegistrationSubmissionJson =
  | null
  | boolean
  | number
  | string
  | RegistrationSubmissionJson[]
  | { [key: string]: RegistrationSubmissionJson };

export interface FrozenRegistrationSubmissionPayload<T extends RegistrationSubmissionJson> {
  payload: T;
  canonicalJson: string;
  hash: string;
}

export function canonicalizeRegistrationSubmissionPayload(value: unknown): string {
  return JSON.stringify(toCanonicalJson(value, '$'));
}

export function hashRegistrationSubmissionPayload(value: unknown, sha256: (value: string) => string): string {
  return sha256(canonicalizeRegistrationSubmissionPayload(value));
}

export function freezeProductRegistrationPayload<T extends RegistrationSubmissionJson>(
  value: T,
  sha256: (value: string) => string,
): FrozenRegistrationSubmissionPayload<T> {
  const payload = toCanonicalJson(value, '$') as T;
  deepFreeze(payload);
  const canonicalJson = JSON.stringify(payload);
  return Object.freeze({
    payload,
    canonicalJson,
    hash: sha256(canonicalJson),
  });
}

function toCanonicalJson(value: unknown, path: string): RegistrationSubmissionJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain a finite JSON number.`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => toCanonicalJson(entry, `${path}[${index}]`));
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} contains a non-JSON value.`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must contain plain JSON objects.`);
  }

  const output: Record<string, RegistrationSubmissionJson> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = toCanonicalJson((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
  return output;
}

function deepFreeze(value: RegistrationSubmissionJson): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}
