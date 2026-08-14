import { describe, expect, it } from "vitest";
import {
  AgentDefinitionKeySchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  AgentVersionKeySchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatAgentVersionName,
  OrganizationIdSchema,
} from "../identifiers";
import {
  AgentApprovalCardSchema,
  AgentApprovalDecisionSchema,
  AgentArtifactCardSchema,
  AgentDelegationEventSchema,
  AgentProgressEventSchema,
  CancelAgentTaskSchema,
  ResumeAgentTaskSchema,
  RetryAgentTaskSchema,
} from "./durable-runtime";

const organization = OrganizationIdSchema.parse("durable-organization-row");
const session = formatAgentSessionName(
  organization,
  AgentSessionIdSchema.parse("durable-session-row"),
);
const task = formatAgentSessionTaskName(
  organization,
  AgentSessionIdSchema.parse("durable-session-row"),
  AgentSessionTaskIdSchema.parse("durable-task-row"),
);
const childTask = formatAgentSessionTaskName(
  organization,
  AgentSessionIdSchema.parse("durable-session-row"),
  AgentSessionTaskIdSchema.parse("durable-child-task-row"),
);
const execution = formatAgentExecutionName(
  organization,
  AgentSessionIdSchema.parse("durable-session-row"),
  AgentExecutionIdSchema.parse("durable-execution-row"),
);
const otherSession = formatAgentSessionName(
  organization,
  AgentSessionIdSchema.parse("durable-other-session-row"),
);
const otherTask = formatAgentSessionTaskName(
  organization,
  AgentSessionIdSchema.parse("durable-other-session-row"),
  AgentSessionTaskIdSchema.parse("durable-other-task-row"),
);
const correlation = { session, task, execution };
const APPROVAL_ID = "87c00f28-a6a5-4e3a-aef0-f6798d3a3aac";
const NOW = "2026-08-14T00:00:00.000Z";

describe("durable AgentOS interaction contracts", () => {
  it("accepts bounded canonical progress correlation and all durable states", () => {
    for (const status of [
      "queued",
      "running",
      "waiting_dependency",
      "waiting_approval",
      "paused",
      "completed",
      "failed",
      "cancelled",
    ] as const) {
      expect(
        AgentProgressEventSchema.parse({
          name: "kiditem.ui.agent_progress.v1",
          ...correlation,
          status,
          progress: 0.4,
          label: "상품 근거 확인 중",
          updatedAt: NOW,
        }).status,
      ).toBe(status);
    }

    expect(() =>
      AgentProgressEventSchema.parse({
        name: "kiditem.ui.agent_progress.v1",
        session: otherSession,
        task: otherTask,
        execution,
        status: "running",
        progress: 0.4,
        label: "상품 근거 확인 중",
        updatedAt: NOW,
      }),
    ).toThrow();
  });

  it("rejects browser authority and arbitrary approval endpoints", () => {
    expect(() =>
      AgentApprovalCardSchema.parse({
        name: "kiditem.ui.agent_approval.v1",
        approvalId: APPROVAL_ID,
        ...correlation,
        capabilityKey: "supply.submit",
        summary: "발주 제출",
        resourceVersions: [],
        expiresAt: NOW,
        arbitraryEndpoint: "/api/private",
      }),
    ).toThrow();

    expect(() =>
      AgentApprovalDecisionSchema.parse({
        approvalId: APPROVAL_ID,
        ...correlation,
        decision: "approved",
        idempotencyKey: "approval:1",
        organizationId: "forged",
      }),
    ).toThrow();
  });

  it("uses registered navigation action ids for artifacts, never urls", () => {
    expect(
      AgentArtifactCardSchema.parse({
        name: "kiditem.ui.agent_artifact.v1",
        artifactId: "df3edfa6-ce18-429b-9ef3-7e6c7fb7f709",
        ...correlation,
        artifactType: "report",
        label: "소싱 보고서",
        sha256: "a".repeat(64),
        navigationActionId: "11111111-1111-4111-8111-111111111111",
        createdAt: NOW,
      }).navigationActionId,
    ).toBe("11111111-1111-4111-8111-111111111111");
    expect(() =>
      AgentArtifactCardSchema.parse({
        name: "kiditem.ui.agent_artifact.v1",
        artifactId: "df3edfa6-ce18-429b-9ef3-7e6c7fb7f709",
        ...correlation,
        artifactType: "report",
        label: "소싱 보고서",
        sha256: "a".repeat(64),
        navigationActionId: "11111111-1111-4111-8111-111111111111",
        url: "https://attacker.invalid",
        createdAt: NOW,
      }),
    ).toThrow();
  });

  it("requires canonical correlation and idempotency for task controls and delegation", () => {
    const taskControl = {
      session,
      task,
      idempotencyKey: "operator-action:1",
    };
    expect(
      RetryAgentTaskSchema.parse({ ...taskControl, expectedStatus: "failed" }),
    ).toEqual({ ...taskControl, expectedStatus: "failed" });
    expect(
      ResumeAgentTaskSchema.parse({ ...taskControl, expectedStatus: "paused" }),
    ).toEqual({ ...taskControl, expectedStatus: "paused" });
    expect(
      CancelAgentTaskSchema.parse({
        ...taskControl,
        expectedStatus: "running",
      }),
    ).toEqual({ ...taskControl, expectedStatus: "running" });
    expect(
      AgentDelegationEventSchema.parse({
        name: "kiditem.ui.agent_delegation.v1",
        session,
        parentTask: task,
        childTask,
        fromAgentVersion: formatAgentVersionName(
          AgentDefinitionKeySchema.parse("operator"),
          AgentVersionKeySchema.parse("1"),
        ),
        toAgentVersion: formatAgentVersionName(
          AgentDefinitionKeySchema.parse("sourcing"),
          AgentVersionKeySchema.parse("2"),
        ),
        status: "created",
        createdAt: NOW,
      }).toAgentVersion,
    ).toBe("agentDefinitions/sourcing/versions/2");
  });
});
