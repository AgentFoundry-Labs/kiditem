import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cleanSecret, webhookSecretShape } from "../src/secret-value";

describe("cleanSecret", () => {
  it.each([
    ["lin_wh_abc", "lin_wh_abc"],
    ["  lin_wh_abc\r\n", "lin_wh_abc"],
    ["[200~lin_wh_abc[201~", "lin_wh_abc"],
    ['"lin_wh_abc"', "lin_wh_abc"],
    ["'lin_wh_abc'\n", "lin_wh_abc"],
    ["﻿​lin_wh_abc⁠", "lin_wh_abc"],
    ["github_pat_11AB_cd", "github_pat_11AB_cd"],
  ])("turns %j into %j", (input, expected) => {
    expect(cleanSecret(input)).toBe(expected);
  });

  it("keeps quotes that do not wrap the whole value and treats missing values as empty", () => {
    expect(cleanSecret('lin_wh_"abc')).toBe('lin_wh_"abc');
    expect(cleanSecret(undefined)).toBe("");
    expect(cleanSecret("  \n")).toBe("");
  });
});

describe("webhookSecretShape", () => {
  const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 8);

  it("reports the length, the Linear prefix, whether cleaning changed the value and a short fingerprint", async () => {
    await expect(webhookSecretShape("lin_wh_abcdef")).resolves.toEqual({
      length: 13,
      linearPrefix: true,
      cleaned: false,
      fingerprint: fingerprint("lin_wh_abcdef"),
    });
    await expect(webhookSecretShape("[200~lin_wh_abcdef[201~")).resolves.toEqual({
      length: 13,
      linearPrefix: true,
      cleaned: true,
      fingerprint: fingerprint("lin_wh_abcdef"),
    });
    await expect(webhookSecretShape("lin_api_abc")).resolves.toMatchObject({ length: 11, linearPrefix: false });
    await expect(webhookSecretShape(undefined)).resolves.toEqual({
      length: 0,
      linearPrefix: false,
      cleaned: false,
      fingerprint: fingerprint(""),
    });
  });

  it("matches the fingerprint an operator computes with shasum", async () => {
    const shape = await webhookSecretShape("lin_wh_zzzz");
    expect(shape.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(shape.fingerprint).toBe(fingerprint("lin_wh_zzzz"));
  });
});
