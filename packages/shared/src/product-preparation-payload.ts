import { createHash } from "node:crypto";

export type ProductPreparationJson =
  | null
  | boolean
  | number
  | string
  | ProductPreparationJson[]
  | { [key: string]: ProductPreparationJson };

export interface FrozenProductPreparationPayload<
  T extends ProductPreparationJson,
> {
  payload: T;
  canonicalJson: string;
  hash: string;
}

export function canonicalizeProductPreparationPayload(value: unknown): string {
  return JSON.stringify(toCanonicalJson(value, "$"));
}

export function hashProductPreparationPayload(value: unknown): string {
  return createHash("sha256")
    .update(canonicalizeProductPreparationPayload(value))
    .digest("hex");
}

export function freezeProductPreparationPayload<
  T extends ProductPreparationJson,
>(value: T): FrozenProductPreparationPayload<T> {
  const payload = toCanonicalJson(value, "$") as T;
  deepFreeze(payload);
  const canonicalJson = JSON.stringify(payload);
  return Object.freeze({
    payload,
    canonicalJson,
    hash: createHash("sha256").update(canonicalJson).digest("hex"),
  });
}

function toCanonicalJson(value: unknown, path: string): ProductPreparationJson {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain a finite JSON number.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      toCanonicalJson(entry, `${path}[${index}]`),
    );
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} contains a non-JSON value.`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must contain plain JSON objects.`);
  }

  const output: Record<string, ProductPreparationJson> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = toCanonicalJson(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
  }
  return output;
}

function deepFreeze(value: ProductPreparationJson): void {
  if (value === null || typeof value !== "object") return;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    deepFreeze(child);
  }
  Object.freeze(value);
}
