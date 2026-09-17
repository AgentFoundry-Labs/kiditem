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
  it("reports only the length, the Linear prefix and whether cleaning changed the value", () => {
    expect(webhookSecretShape("lin_wh_abcdef")).toEqual({ length: 13, linearPrefix: true, cleaned: false });
    expect(webhookSecretShape("[200~lin_wh_abcdef[201~")).toEqual({
      length: 13,
      linearPrefix: true,
      cleaned: true,
    });
    expect(webhookSecretShape("lin_api_abc")).toEqual({ length: 11, linearPrefix: false, cleaned: false });
    expect(webhookSecretShape(undefined)).toEqual({ length: 0, linearPrefix: false, cleaned: false });
  });
});
