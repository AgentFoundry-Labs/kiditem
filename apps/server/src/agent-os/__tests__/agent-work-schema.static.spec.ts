import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);
const schema = readFileSync(
  path.join(root, "prisma/models/agent-work.prisma"),
  "utf8",
);

function agentWorkModelNames(source: string): string[] {
  return [...source.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]);
}

function capabilityInvocationFieldNames(source: string): string[] {
  return [...source.matchAll(/^  ([A-Za-z]\w*)\s+/gm)].map((match) => match[1]);
}

describe("CapabilityInvocation persistence contract", () => {
  it("uses exactly one durable Agent OS model and the request-key replay invariant", () => {
    expect(agentWorkModelNames(schema)).toEqual(["CapabilityInvocation"]);
    expect(schema).toContain("@@unique([id, organizationId])");
    expect(schema).toContain("@@unique([organizationId, requestKey])");
    expect(schema).toContain('@@map("capability_invocations")');
  });

  it("uses only the focused invocation fields and actor relations", () => {
    expect(capabilityInvocationFieldNames(schema)).toEqual([
      "id",
      "organizationId",
      "initiatingUserId",
      "capabilityKey",
      "actingAgentKey",
      "requestKey",
      "canonicalInput",
      "inputHash",
      "status",
      "approvalStatus",
      "approvalInputHash",
      "approvalRequestedAt",
      "approvalExpiresAt",
      "approvalDecidedByUserId",
      "approvalDecisionReason",
      "approvalDecidedAt",
      "result",
      "error",
      "createdAt",
      "updatedAt",
      "finishedAt",
      "organization",
      "initiatingUser",
      "approvalDecidedByUser",
    ]);
  });

  it("keeps the focused status, approval, result, and index surface", () => {
    for (const required of [
      /id\s+String\s+@id\s+@default\(uuid\(\)\)\s+@db\.Uuid/,
      /organizationId\s+String\s+@map\("organization_id"\)\s+@db\.Uuid/,
      /initiatingUserId\s+String\s+@map\("initiating_user_id"\)\s+@db\.Uuid/,
      /capabilityKey\s+String\s+@map\("capability_key"\)/,
      /actingAgentKey\s+String\s+@map\("acting_agent_key"\)/,
      /requestKey\s+String\s+@map\("request_key"\)/,
      /canonicalInput\s+Json\s+@map\("canonical_input"\)\s+@db\.JsonB/,
      /inputHash\s+String\s+@map\("input_hash"\)/,
      /status\s+String\s+@default\("pending"\)/,
      /approvalStatus\s+String\s+@default\("not_required"\)\s+@map\("approval_status"\)/,
      /approvalInputHash\s+String\?\s+@map\("approval_input_hash"\)/,
      /approvalRequestedAt\s+DateTime\?\s+@map\("approval_requested_at"\)\s+@db\.Timestamptz/,
      /approvalExpiresAt\s+DateTime\?\s+@map\("approval_expires_at"\)\s+@db\.Timestamptz/,
      /approvalDecidedByUserId\s+String\?\s+@map\("approval_decided_by_user_id"\)\s+@db\.Uuid/,
      /approvalDecisionReason\s+String\?\s+@map\("approval_decision_reason"\)\s+@db\.Text/,
      /approvalDecidedAt\s+DateTime\?\s+@map\("approval_decided_at"\)\s+@db\.Timestamptz/,
      /result\s+Json\?\s+@db\.JsonB/,
      /error\s+Json\?\s+@db\.JsonB/,
      /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz/,
      /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)\s+@db\.Timestamptz/,
      /finishedAt\s+DateTime\?\s+@map\("finished_at"\)\s+@db\.Timestamptz/,
      /@@index\(\[organizationId, status, createdAt\]\)/,
      /@@index\(\[organizationId, approvalStatus, approvalExpiresAt\]\)/,
      /@@index\(\[initiatingUserId\]\)/,
      /@@index\(\[approvalDecidedByUserId\]\)/,
      /"CapabilityInvocationInitiator"/,
      /"CapabilityInvocationApprover"/,
    ]) {
      expect(schema).toMatch(required);
    }
  });

  it("excludes the retired graph, durable runtime coordinates, and lease/retry state", () => {
    for (const forbidden of [
      "AgentVersion",
      "AgentSession",
      "AgentTask",
      "AgentAttempt",
      "AgentCapabilityInvocation",
      "AgentCapabilityApproval",
      "sessionId",
      "taskId",
      "attemptId",
      "agentVersionId",
      "executionId",
      "applicationVersion",
      "authorizingGitSha",
      "runtimeType",
      "providerSessionId",
      "capabilityContractFingerprint",
      "leaseOwner",
      "leaseExpiresAt",
      "attemptCount",
      "retry",
      "version",
    ]) {
      expect(schema).not.toContain(forbidden);
    }
    expect(schema).not.toMatch(/enum\s+/);
  });
});
