import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AgentDefinitionKeySchema,
  AgentExecutionAttemptIdSchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  AgentVersionKeySchema,
  AguiRunIdSchema,
  CopilotThreadIdSchema,
  formatAgentConversationEventName,
  formatAgentDefinitionName,
  formatAgentExecutionAttemptName,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatAgentVersionName,
  formatOperationCheckpointName,
  formatOperationRunName,
  formatOrganizationName,
  formatUserName,
  IdempotencyKeySchema,
  LogicalIdSchema,
  NonNegativeDecimalSequenceSchema,
  OpaqueReplayCursorSchema,
  OpaqueShortLivedTokenSchema,
  OperationRunIdSchema,
  OrganizationIdSchema,
  OwnerIdSchema,
  parseAgentConversationEventName,
  parseAgentDefinitionName,
  parseAgentExecutionAttemptName,
  parseAgentExecutionName,
  parseAgentSessionName,
  parseAgentSessionTaskName,
  parseAgentVersionName,
  parseOperationCheckpointName,
  parseOperationRunName,
  parseOrganizationName,
  parseUserName,
  PositiveDecimalSequenceSchema,
  RequestIdSchema,
  Sha256DigestSchema,
  ToolCallIdSchema,
  UserIdSchema,
} from "./index";
import type {
  AgentExecutionId,
  AgentSessionId,
  AguiRunId,
  CopilotThreadId,
  LogicalId,
  NonNegativeDecimalSequence,
  OwnerId,
  OrganizationId,
  PositiveDecimalSequence,
  UserId,
} from "./index";

const organization = OrganizationIdSchema.parse("legacy-organization-row");
const user = UserIdSchema.parse("legacy-user-row");
const agentDefinitionKey = AgentDefinitionKeySchema.parse("operator");
const agentVersion = AgentVersionKeySchema.parse("2026.08.13");
const sessionA = AgentSessionIdSchema.parse("legacy-session-a");
const sessionB = AgentSessionIdSchema.parse("legacy-session-b");
const task = AgentSessionTaskIdSchema.parse("legacy-task-row");
const execution = AgentExecutionIdSchema.parse("legacy-execution-row");
const attempt = AgentExecutionAttemptIdSchema.parse("legacy-attempt-row");
const operation = OperationRunIdSchema.parse("legacy-operation-row");
const firstSequence = PositiveDecimalSequenceSchema.parse("1");
const checkpointSequence = PositiveDecimalSequenceSchema.parse("42");

describe("canonical identifiers", () => {
  it("keeps branded identifier categories non-interchangeable", () => {
    expectTypeOf<OwnerId>().not.toEqualTypeOf<LogicalId>();
    expectTypeOf<OrganizationId>().not.toEqualTypeOf<UserId>();
    expectTypeOf<AgentSessionId>().not.toEqualTypeOf<AgentExecutionId>();
    expectTypeOf<CopilotThreadId>().not.toEqualTypeOf<AguiRunId>();
    expectTypeOf<PositiveDecimalSequence>().not.toEqualTypeOf<NonNegativeDecimalSequence>();

    // @ts-expect-error Owner and logical identifiers must remain distinct.
    const invalidOwner: OwnerId = LogicalIdSchema.parse("database-row-42");
    // @ts-expect-error Organization and user identifiers must remain distinct.
    const invalidOrganization: OrganizationId = user;
    // @ts-expect-error Session and execution identifiers must remain distinct.
    const invalidSession: AgentSessionId = execution;
    void invalidOwner;
    void invalidOrganization;
    void invalidSession;
  });

  it("accepts bounded owner and logical identifiers without TypeID prefixes", () => {
    expect(OwnerIdSchema.parse("owner-row-7")).toBe("owner-row-7");
    expect(LogicalIdSchema.parse("database-row-42")).toBe("database-row-42");

    for (const invalidIdentifier of [
      "",
      "/not-a-logical-id",
      "contains space",
    ]) {
      expect(() => OwnerIdSchema.parse(invalidIdentifier)).toThrow();
      expect(() => LogicalIdSchema.parse(invalidIdentifier)).toThrow();
    }
  });

  it("formats and parses every canonical resource name without persisting a name", () => {
    const organizationName = formatOrganizationName(organization);
    const userName = formatUserName(user);
    const agentDefinitionName = formatAgentDefinitionName(agentDefinitionKey);
    const agentVersionName = formatAgentVersionName(
      agentDefinitionKey,
      agentVersion,
    );
    const sessionName = formatAgentSessionName(organization, sessionA);
    const taskName = formatAgentSessionTaskName(organization, sessionA, task);
    const executionName = formatAgentExecutionName(
      organization,
      sessionA,
      execution,
    );
    const attemptName = formatAgentExecutionAttemptName(
      organization,
      sessionA,
      execution,
      attempt,
    );
    const eventName = formatAgentConversationEventName(
      organization,
      sessionA,
      firstSequence,
    );
    const operationName = formatOperationRunName(organization, operation);
    const checkpointName = formatOperationCheckpointName(
      organization,
      operation,
      checkpointSequence,
    );

    expect(organizationName).toBe("organizations/legacy-organization-row");
    expect(userName).toBe("users/legacy-user-row");
    expect(agentDefinitionName).toBe("agentDefinitions/operator");
    expect(agentVersionName).toBe(
      "agentDefinitions/operator/versions/2026.08.13",
    );
    expect(sessionName).toBe(
      "organizations/legacy-organization-row/agentSessions/legacy-session-a",
    );
    expect(taskName).toBe(
      "organizations/legacy-organization-row/agentSessions/legacy-session-a/tasks/legacy-task-row",
    );
    expect(executionName).toBe(
      "organizations/legacy-organization-row/agentSessions/legacy-session-a/executions/legacy-execution-row",
    );
    expect(attemptName).toBe(
      "organizations/legacy-organization-row/agentSessions/legacy-session-a/executions/legacy-execution-row/attempts/legacy-attempt-row",
    );
    expect(eventName).toBe(
      "organizations/legacy-organization-row/agentSessions/legacy-session-a/events/1",
    );
    expect(operationName).toBe(
      "organizations/legacy-organization-row/operations/legacy-operation-row",
    );
    expect(checkpointName).toBe(
      "organizations/legacy-organization-row/operations/legacy-operation-row/checkpoints/42",
    );

    expect(parseOrganizationName(organizationName)).toEqual({ organization });
    expect(parseUserName(userName)).toEqual({ user });
    expect(parseAgentDefinitionName(agentDefinitionName)).toEqual({
      agentDefinitionKey,
    });
    expect(
      parseAgentVersionName(agentVersionName, agentDefinitionName),
    ).toEqual({
      agentDefinitionKey,
      version: agentVersion,
    });
    expect(parseAgentSessionName(sessionName, organizationName)).toEqual({
      organization,
      session: sessionA,
    });
    expect(parseAgentSessionTaskName(taskName, sessionName)).toEqual({
      organization,
      session: sessionA,
      task,
    });
    expect(parseAgentExecutionName(executionName, sessionName)).toEqual({
      organization,
      session: sessionA,
      execution,
    });
    expect(parseAgentExecutionAttemptName(attemptName, executionName)).toEqual({
      organization,
      session: sessionA,
      execution,
      attempt,
    });
    expect(parseAgentConversationEventName(eventName, sessionName)).toEqual({
      organization,
      session: sessionA,
      sequence: firstSequence,
    });
    expect(parseOperationRunName(operationName, organizationName)).toEqual({
      organization,
      operation,
    });
    expect(parseOperationCheckpointName(checkpointName, operationName)).toEqual(
      {
        organization,
        operation,
        sequence: checkpointSequence,
      },
    );
  });

  it("rejects resource type and parent mismatches exactly", () => {
    const sessionAName = formatAgentSessionName(organization, sessionA);
    const sessionBName = formatAgentSessionName(organization, sessionB);
    const taskFromSessionB = formatAgentSessionTaskName(
      organization,
      sessionB,
      task,
    );
    const executionName = formatAgentExecutionName(
      organization,
      sessionA,
      execution,
    );
    const operationName = formatOperationRunName(organization, operation);

    expect(() =>
      parseAgentSessionTaskName(taskFromSessionB, sessionAName),
    ).toThrow();
    expect(() => parseAgentExecutionName(operationName)).toThrow();
    expect(() => parseOperationRunName(executionName)).toThrow();
    expect(() =>
      parseAgentSessionName(
        "organizations/legacy-organization-row/agentSessions/legacy-session-a/",
      ),
    ).toThrow();
    expect(() =>
      parseAgentVersionName(
        "agentDefinitions/operator/versions/2026.08.13/extra",
      ),
    ).toThrow();
    expect(() =>
      parseAgentConversationEventName(executionName, sessionAName),
    ).toThrow();
  });

  it("keeps external, request, idempotency, sequence, token, and digest contracts distinct", () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    const token = "short-lived-token-that-is-at-least-thirty-two-bytes";
    const digest = "a".repeat(64);

    expect(CopilotThreadIdSchema.parse("copilot-thread-1")).toBe(
      "copilot-thread-1",
    );
    expect(AguiRunIdSchema.parse("agui-run-1")).toBe("agui-run-1");
    expect(ToolCallIdSchema.parse("tool-call-1")).toBe("tool-call-1");
    expect(RequestIdSchema.parse(requestId)).toBe(requestId);
    expect(IdempotencyKeySchema.parse("operation-request-7")).toBe(
      "operation-request-7",
    );
    expect(PositiveDecimalSequenceSchema.parse("999")).toBe("999");
    expect(NonNegativeDecimalSequenceSchema.parse("0")).toBe("0");
    expect(OpaqueReplayCursorSchema.parse("opaque-replay-cursor")).toBe(
      "opaque-replay-cursor",
    );
    expect(OpaqueShortLivedTokenSchema.parse(token)).toBe(token);
    expect(Sha256DigestSchema.parse(digest)).toBe(digest);

    for (const invalidSequence of ["", "0", "01", "-1", "+1", "1.0", 1]) {
      expect(() =>
        PositiveDecimalSequenceSchema.parse(invalidSequence),
      ).toThrow();
    }
    for (const invalidSequence of ["", "00", "01", "-1", "+1", "1.0", 1]) {
      expect(() =>
        NonNegativeDecimalSequenceSchema.parse(invalidSequence),
      ).toThrow();
    }
    for (const invalidRequestId of [
      "11111111-1111-1111-8111-111111111111",
      "11111111-1111-4111-7111-111111111111",
      "not-a-uuid",
    ]) {
      expect(() => RequestIdSchema.parse(invalidRequestId)).toThrow();
    }
    expect(() => IdempotencyKeySchema.parse("")).toThrow();
    expect(() => IdempotencyKeySchema.parse("a".repeat(257))).toThrow();
    expect(() => OpaqueReplayCursorSchema.parse("short")).toThrow();
    expect(() => OpaqueShortLivedTokenSchema.parse("too-short")).toThrow();
    expect(() => Sha256DigestSchema.parse("A".repeat(64))).toThrow();
    expect(() => Sha256DigestSchema.parse("a".repeat(63))).toThrow();
  });
});
