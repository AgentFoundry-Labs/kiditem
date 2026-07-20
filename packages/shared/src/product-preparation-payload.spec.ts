import { describe, expect, it } from "vitest";
import {
  canonicalizeProductPreparationPayload,
  freezeProductPreparationPayload,
  hashProductPreparationPayload,
} from "./product-preparation-payload";

describe("shared product preparation payload contract", () => {
  it("canonicalizes object keys and produces the server-compatible SHA-256 hash", () => {
    const payload = { z: 1, nested: { beta: true, alpha: null }, a: 2 };

    expect(canonicalizeProductPreparationPayload(payload)).toBe(
      '{"a":2,"nested":{"alpha":null,"beta":true},"z":1}',
    );
    expect(hashProductPreparationPayload({ z: 1, a: 2 })).toBe(
      "c2985c5ba6f7d2a55e768f92490ca09388e95bc4cccb9fdf11b15f4d42f93e73",
    );
  });

  it("returns a deeply frozen canonical payload and rejects non-JSON values", () => {
    const frozen = freezeProductPreparationPayload({
      values: [{ b: 2, a: 1 }],
    });

    expect(frozen.payload).toEqual({ values: [{ a: 1, b: 2 }] });
    expect(Object.isFrozen(frozen.payload)).toBe(true);
    expect(Object.isFrozen(frozen.payload.values[0])).toBe(true);
    expect(() =>
      canonicalizeProductPreparationPayload({ value: Number.NaN }),
    ).toThrow(/finite JSON number/);
  });
});
