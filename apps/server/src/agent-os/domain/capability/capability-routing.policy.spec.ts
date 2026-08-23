import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { CapabilityDefinition } from "./capability-definition";
import {
  isMutation,
  requiresDomainDelegation,
  requiresHumanApproval,
} from "./capability-routing.policy";

const definition = (
  effects: CapabilityDefinition["effects"],
  approvalRisk: CapabilityDefinition["approvalRisk"] = "none",
): CapabilityDefinition => ({
  key: "products.test_capability",
  ownerDomain: "products",
  description: "Test capability.",
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  effects,
  approvalRisk,
  idempotency: effects.some((effect) =>
    ["db_write", "external_write", "job_enqueue"].includes(effect),
  )
    ? "required"
    : "none",
  ownerInputPort: "products.testCapability",
});

describe("capability routing policy", () => {
  it("routes own and cross-domain reads directly", () => {
    const read = definition(["read"]);

    expect(isMutation(read)).toBe(false);
    expect(requiresDomainDelegation(["products"], read)).toBe(false);
    expect(requiresDomainDelegation(["sourcing"], read)).toBe(false);
  });

  it("routes own mutations directly and cross-domain mutations by delegation", () => {
    const mutation = definition(["db_write"]);

    expect(requiresDomainDelegation(["products"], mutation)).toBe(false);
    expect(requiresDomainDelegation(["sourcing"], mutation)).toBe(true);
  });

  it("requires human approval for medium and high mutations only", () => {
    expect(requiresHumanApproval(definition(["db_write"], "medium"))).toBe(
      true,
    );
    expect(requiresHumanApproval(definition(["external_write"], "high"))).toBe(
      true,
    );
    expect(requiresHumanApproval(definition(["job_enqueue"], "low"))).toBe(
      false,
    );
    expect(requiresHumanApproval(definition(["read"], "high"))).toBe(false);
  });
});
