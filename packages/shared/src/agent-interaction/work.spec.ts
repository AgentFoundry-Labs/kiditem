import { describe, expect, it } from "vitest";
import {
  AgentAttemptStatusSchema,
  AgentCapabilityApprovalStatusSchema,
  AgentCapabilityInvocationStatusSchema,
  AgentResultEnvelopeSchema,
  AgentWorkTaskStatusSchema,
  AuthorizationKindSchema,
  CapabilityIdempotencySchema,
} from "./work";

describe("AgentResultEnvelopeSchema", () => {
  it("accepts concise completed results with resource and operation references", () => {
    expect(
      AgentResultEnvelopeSchema.parse({
        outcome: "completed",
        summary: "Inventory checked.",
        resourceRefs: [{ kind: "product", id: "product-1", version: null }],
        operationRefs: [{ kind: "operation", id: "operation-1" }],
        output: { count: 1 },
      }),
    ).toMatchObject({ outcome: "completed", summary: "Inventory checked." });
  });

  it("does not allow continuation or artifact fields", () => {
    expect(
      AgentResultEnvelopeSchema.safeParse({
        outcome: "completed",
        summary: "Done.",
        resourceRefs: [],
        operationRefs: [],
        continuationKey: "nope",
        artifacts: [],
      }).success,
    ).toBe(false);
  });

  it("exports exact work status, authorization, and idempotency vocabularies", () => {
    expect(AgentWorkTaskStatusSchema.options).toEqual([
      "open",
      "completed",
      "failed",
      "cancelled",
    ]);
    expect(AgentAttemptStatusSchema.options).toEqual([
      "starting",
      "running",
      "succeeded",
      "failed",
      "process_interrupted",
      "cancelled",
    ]);
    expect(AgentCapabilityInvocationStatusSchema.options).toEqual([
      "authorized",
      "approval_pending",
      "ready",
      "executing",
      "succeeded",
      "failed",
    ]);
    expect(AgentCapabilityApprovalStatusSchema.options).toEqual([
      "pending",
      "approved",
      "rejected",
      "expired",
    ]);
    expect(AuthorizationKindSchema.options).toEqual([
      "agent_default_scope",
      "cross_domain_read_grant",
      "explicit_execution_grant",
    ]);
    expect(CapabilityIdempotencySchema.options).toEqual([
      "none",
      "recommended",
      "required",
    ]);
  });
});
