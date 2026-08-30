import { describe, expect, it } from "vitest";
import * as Work from "./work";

describe("CapabilityResultEnvelopeSchema", () => {
  it("accepts concise bounded capability results", () => {
    expect(
      Work.CapabilityResultEnvelopeSchema.parse({
        summary: "Inventory checked.",
        resourceRefs: [{ kind: "product", id: "product-1", version: null }],
        operationRefs: [{ kind: "operation", id: "operation-1" }],
        output: { count: 1 },
      }),
    ).toMatchObject({ summary: "Inventory checked." });
  });

  it("rejects Date and class instances instead of silently serializing them", () => {
    class ProviderPayload {
      readonly status = "provider";
    }

    expect(
      Work.BoundedCanonicalJsonSchema.safeParse({ observedAt: new Date() }).success,
    ).toBe(false);
    expect(
      Work.BoundedCanonicalJsonSchema.safeParse({ payload: new ProviderPayload() }).success,
    ).toBe(false);
  });

  it("does not allow legacy continuation, outcome, or artifact fields", () => {
    expect(
      Work.CapabilityResultEnvelopeSchema.safeParse({
        summary: "Done.",
        resourceRefs: [],
        operationRefs: [],
        outcome: "completed",
        continuationKey: "nope",
        artifacts: [],
      }).success,
    ).toBe(false);
  });

  it("keeps invocation statuses and embedded approvals on the focused vocabulary", () => {
    expect(Work.CapabilityInvocationStatusSchema.options).toEqual([
      "pending",
      "succeeded",
      "failed",
    ]);
    expect(Work.CapabilityInvocationApprovalStatusSchema.options).toEqual([
      "not_required",
      "pending",
      "approved",
      "rejected",
      "expired",
    ]);
  });

  it("does not export Task, Attempt, authorization, or legacy result aliases", () => {
    for (const legacyExport of [
      "AgentTaskStatusSchema",
      "AgentAttemptStatusSchema",
      "AuthorizationKindSchema",
      "AgentResultEnvelopeSchema",
    ]) {
      expect(Work).not.toHaveProperty(legacyExport);
    }
  });

  it("keeps bounded invocation errors separate from successful results", () => {
    expect(
      Work.CapabilityInvocationErrorSchema.parse({
        code: "owner_rejected",
        message: "The owner rejected the request.",
      }),
    ).toEqual({
      code: "owner_rejected",
      message: "The owner rejected the request.",
    });
    expect(
      Work.CapabilityInvocationErrorSchema.safeParse({
        code: "owner_rejected",
        message: "The owner rejected the request.",
        retry: true,
      }).success,
    ).toBe(false);
  });
});
