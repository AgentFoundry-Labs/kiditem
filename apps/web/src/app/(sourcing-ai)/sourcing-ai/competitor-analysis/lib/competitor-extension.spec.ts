import { describe, expect, it } from "vitest";
import {
  COMPETITOR_EXTENSION_MIN_VERSION,
  isVersionAtLeast,
} from "./competitor-extension";

describe("competitor extension version gate", () => {
  it("requires the browser collection session extension version", () => {
    expect(COMPETITOR_EXTENSION_MIN_VERSION).toBe("1.2.32");
    expect(isVersionAtLeast("1.2.23", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.25", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.27", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.28", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.29", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.30", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.31", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.32", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      true,
    );
    expect(isVersionAtLeast("1.3.0", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      true,
    );
  });
});
