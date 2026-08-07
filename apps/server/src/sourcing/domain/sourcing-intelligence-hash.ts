import { createHash } from 'node:crypto';

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

export function canonicalizeSourcingIntelligenceJson(value: unknown): string {
  return JSON.stringify(toCanonicalJson(value, '$', new Set<object>()));
}

export function hashSourcingIntelligenceJson(value: unknown): string {
  return createHash('sha256')
    .update(canonicalizeSourcingIntelligenceJson(value))
    .digest('hex');
}

function toCanonicalJson(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): CanonicalJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite JSON numbers.`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} contains a non-JSON value.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${path} contains a circular reference.`);
  }

  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) {
    throw new TypeError(`${path} must contain only plain JSON objects.`);
  }

  ancestors.add(value);
  try {
    if (isArray) {
      return value.map((entry, index) =>
        toCanonicalJson(entry, `${path}[${index}]`, ancestors),
      );
    }

    const output = Object.create(null) as Record<string, CanonicalJson>;
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) {
        throw new TypeError(`${path}.${key} contains undefined.`);
      }
      output[key] = toCanonicalJson(entry, `${path}.${key}`, ancestors);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
