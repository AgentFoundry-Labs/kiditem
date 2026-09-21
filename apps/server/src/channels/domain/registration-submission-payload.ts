import { createHash } from 'node:crypto';

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

export function hashRegistrationSubmissionPayload(value: unknown): string {
  return createHash('sha256')
    .update(canonicalizeRegistrationSubmissionPayload(value))
    .digest('hex');
}

export function freezeProductRegistrationPayload<T extends RegistrationSubmissionJson>(
  value: T,
): FrozenRegistrationSubmissionPayload<T> {
  const payload = toCanonicalJson(value, '$') as T;
  deepFreeze(payload);
  const canonicalJson = JSON.stringify(payload);
  return Object.freeze({
    payload,
    canonicalJson,
    hash: createHash('sha256').update(canonicalJson).digest('hex'),
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
