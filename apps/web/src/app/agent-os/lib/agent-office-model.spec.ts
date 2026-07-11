import { describe, expect, it } from "vitest";
import { makeAgentRosterItem } from "../test-utils/agent-office-fixtures";
import {
  buildAgentOfficeModel,
  resolveAgentOfficeNodeStatus,
} from "./agent-office-model";

describe("buildAgentOfficeModel", () => {
  it("derives office node statuses from runs, requests, and approvals", () => {
    const model = buildAgentOfficeModel({
      roster: [
        makeAgentRosterItem(),
        makeAgentRosterItem({
          definition: {
            type: "sourcing",
            name: "Sourcing",
            displayName: "소싱 담당",
            responsibility: "상품 후보와 공급처 신호를 수집한다.",
            officeOrder: 400,
          },
          runtime: {
            ...makeAgentRosterItem().runtime!,
            instanceId: "agent-sourcing",
            trustLevel: 0,
          },
        }),
      ],
      runs: [
        {
          id: "run-1",
          organizationId: "org-1",
          agentInstanceId: "agent-manager",
          requestId: "request-1",
          taskKey: "conversation:conversation-1",
          status: "running",
          attempt: 1,
          invocationSource: "agent_os_conversation",
          adapterType: "hermes_local",
          model: "gpt-5.4",
          provider: "hermes",
          startedAt: "2026-07-09T00:00:00.000Z",
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          output: null,
          costMicros: null,
        },
      ],
      requests: [
        {
          id: "request-2",
          organizationId: "org-1",
          agentInstanceId: "agent-sourcing",
          agentType: "sourcing",
          taskKey: "conversation:conversation-1:sourcing",
          source: "agent_os_conversation",
          sourceResourceType: null,
          sourceResourceId: null,
          sourceWorkflowRunId: null,
          status: "requires_approval",
          priority: 5,
          attempts: 0,
          maxAttempts: 1,
          scheduledFor: "2026-07-09T00:01:00.000Z",
          claimedAt: null,
          finishedAt: null,
          latestRunId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: "2026-07-09T00:01:00.000Z",
        },
      ],
      approvals: [
        {
          id: "approval-1",
          organizationId: "org-1",
          agentInstanceId: "agent-sourcing",
          requestId: "request-2",
          runId: null,
          status: "pending",
          reasonCode: "approval_required",
          reason: "발주 전 확인",
          prompt: null,
          payload: {},
          actionSnapshot: null,
          requestedByActorType: "agent",
          requestedByActorId: "agent-sourcing",
          requestedByUserId: null,
          approverUserId: null,
          decidedByUserId: null,
          decidedAt: null,
          decisionReason: null,
          expiresAt: null,
          createdAt: "2026-07-09T00:02:00.000Z",
          updatedAt: "2026-07-09T00:02:00.000Z",
        },
      ],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: "0",
    });

    expect(model.nodes.map((node) => [node.id, node.status])).toEqual([
      ["manager", "working"],
      ["sourcing", "blocked"],
    ]);
    expect(model.nodes.find((node) => node.id === "manager")).toMatchObject({
      instanceId: "agent-manager",
      trustLevel: 1,
      adapterType: "hermes_local",
      effectiveModel: "gpt-5.4",
    });
    expect(model.totals).toMatchObject({
      agents: 2,
      working: 1,
      blocked: 1,
      pendingApprovals: 1,
      runningRuns: 1,
      totalCostMicros: "0",
    });
  });

  it("keeps canonical employees visible without runtime instances", () => {
    const model = buildAgentOfficeModel({
      roster: [
        makeAgentRosterItem({
          runtime: null,
          configurationStatus: "instance_missing",
        }),
        makeAgentRosterItem({
          definition: {
            type: "sourcing",
            name: "Sourcing",
            displayName: "소싱 담당",
            responsibility: "상품 후보와 공급처 신호를 수집한다.",
            officeOrder: 400,
          },
          runtime: null,
          configurationStatus: "instance_missing",
        }),
      ],
      runs: [],
      requests: [],
      approvals: [],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: "0",
    });

    expect(model.nodes).toMatchObject([
      {
        id: "manager",
        instanceId: null,
        displayName: "운영 총괄",
        configurationStatus: "instance_missing",
        status: "offline",
      },
      {
        id: "sourcing",
        instanceId: null,
        displayName: "소싱 담당",
        configurationStatus: "instance_missing",
        status: "offline",
      },
    ]);
  });

  it("sorts activities with newest first", () => {
    const model = buildAgentOfficeModel({
      roster: [],
      runs: [],
      requests: [],
      approvals: [],
      conversations: [
        {
          id: "conversation-1",
          organizationId: "org-1",
          title: "첫 대화",
          status: "active",
          createdByUserId: "user-1",
          rootRequestId: null,
          lastMessageAt: "2026-07-09T00:05:00.000Z",
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:05:00.000Z",
        },
      ],
      costEvents: [
        {
          id: "cost-1",
          organizationId: "org-1",
          agentInstanceId: "agent-manager",
          requestId: "request-1",
          runId: "run-1",
          provider: "hermes",
          model: "gpt-5.4",
          inputTokens: 10,
          outputTokens: 4,
          cachedInputTokens: 2,
          costMicros: "1000",
          occurredAt: "2026-07-09T00:03:00.000Z",
        },
      ],
      authorizationEvents: [],
      totalCostMicros: "1000",
    });

    expect(model.activities.map((activity) => activity.id)).toEqual([
      "conversation-1",
      "cost-1",
    ]);
  });

  it("keeps presentation coordinates out of the employee business model", () => {
    const model = buildAgentOfficeModel({
      roster: [makeAgentRosterItem()],
      runs: [],
      requests: [],
      approvals: [],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: "0",
    });

    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]).not.toHaveProperty("x");
    expect(model.nodes[0]).not.toHaveProperty("y");
  });

  it("attaches capabilities through definition ownership instead of runtime hierarchy", () => {
    const model = buildAgentOfficeModel({
      roster: [
        makeAgentRosterItem({
          definition: {
            type: "listing",
            name: "Listing",
            displayName: "상품 등록 담당",
            responsibility:
              "상세페이지, 썸네일, 마켓 등록 초안 패키지를 만든다.",
            officeOrder: 500,
          },
          runtime: {
            ...makeAgentRosterItem().runtime!,
            instanceId: "agent-listing",
          },
        }),
        makeAgentRosterItem({
          definition: {
            type: "thumbnail_analyst",
            name: "Thumbnail Analyst",
            displayName: "썸네일 분석 능력",
            operationalRole: "capability",
            responsibility: "썸네일 품질과 컴플라이언스 리스크를 분석한다.",
            ownerAgentType: "listing",
            officeOrder: 510,
          },
          runtime: {
            ...makeAgentRosterItem().runtime!,
            instanceId: "agent-thumbnail-analyst",
            trustLevel: 0,
          },
        }),
      ],
      runs: [
        {
          id: "run-thumbnail",
          organizationId: "org-1",
          agentInstanceId: "agent-thumbnail-analyst",
          requestId: "request-thumbnail",
          taskKey: "thumbnail:review",
          status: "running",
          attempt: 1,
          invocationSource: "agent_os_conversation",
          adapterType: "hermes_local",
          model: "gpt-5.4",
          provider: "hermes",
          startedAt: "2026-07-09T00:08:00.000Z",
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          output: null,
          costMicros: null,
        },
      ],
      requests: [],
      approvals: [],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: "0",
    });

    expect(model.nodes).toMatchObject([
      {
        id: "listing",
        instanceId: "agent-listing",
        displayName: "상품 등록 담당",
        status: "working",
        activeRunCount: 1,
        capabilities: [
          {
            id: "thumbnail_analyst",
            instanceId: "agent-thumbnail-analyst",
            ownerNodeId: "listing",
            status: "working",
            activeRunCount: 1,
          },
        ],
      },
    ]);
    expect(model.capabilities.map((capability) => capability.id)).toEqual([
      "thumbnail_analyst",
    ]);
    expect(model.totals).toMatchObject({
      agents: 1,
      employees: 1,
      capabilities: 1,
      working: 1,
    });
  });

  it("treats claimed requests as active work before a run starts", () => {
    const model = buildAgentOfficeModel({
      roster: [
        makeAgentRosterItem({
          definition: {
            type: "listing",
            name: "Listing",
            displayName: "상품 등록 담당",
            responsibility:
              "상세페이지, 썸네일, 마켓 등록 초안 패키지를 만든다.",
            officeOrder: 500,
          },
          runtime: {
            ...makeAgentRosterItem().runtime!,
            instanceId: "agent-listing",
          },
        }),
      ],
      runs: [],
      requests: [
        {
          id: "request-claimed",
          organizationId: "org-1",
          agentInstanceId: "agent-listing",
          agentType: "listing",
          taskKey: "conversation:conversation-2:listing",
          source: "agent_os_conversation",
          sourceResourceType: null,
          sourceResourceId: null,
          sourceWorkflowRunId: null,
          status: "claimed",
          priority: 3,
          attempts: 0,
          maxAttempts: 1,
          scheduledFor: "2026-07-09T01:00:00.000Z",
          claimedAt: "2026-07-09T01:01:00.000Z",
          finishedAt: null,
          latestRunId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: "2026-07-09T01:00:00.000Z",
        },
        {
          id: "request-pending",
          organizationId: "org-1",
          agentInstanceId: "agent-listing",
          agentType: "listing",
          taskKey: "conversation:conversation-2:followup",
          source: "agent_os_conversation",
          sourceResourceType: null,
          sourceResourceId: null,
          sourceWorkflowRunId: null,
          status: "pending",
          priority: 2,
          attempts: 0,
          maxAttempts: 1,
          scheduledFor: "2026-07-09T01:02:00.000Z",
          claimedAt: null,
          finishedAt: null,
          latestRunId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: "2026-07-09T01:02:00.000Z",
        },
      ],
      approvals: [],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: "0",
    });

    expect(model.nodes).toMatchObject([
      { id: "listing", status: "working", activeRunCount: 1 },
    ]);
    expect(model.totals).toMatchObject({
      working: 1,
      waiting: 0,
      runningRuns: 0,
    });
  });
});

describe("resolveAgentOfficeNodeStatus", () => {
  it.each([
    ["missing instance", null, "instance_missing", 1, 1, 1, "offline"],
    [
      "incomplete model",
      { lifecycleStatus: "active" },
      "model_plan_incomplete",
      1,
      1,
      1,
      "offline",
    ],
    [
      "paused lifecycle",
      { lifecycleStatus: "paused" },
      "ready",
      1,
      1,
      1,
      "offline",
    ],
    [
      "pending approval wins",
      { lifecycleStatus: "active" },
      "ready",
      1,
      1,
      1,
      "blocked",
    ],
    [
      "running wins over waiting",
      { lifecycleStatus: "active" },
      "ready",
      1,
      1,
      0,
      "working",
    ],
    ["waiting", { lifecycleStatus: "active" }, "ready", 0, 1, 0, "waiting"],
    ["idle", { lifecycleStatus: "active" }, "ready", 0, 0, 0, "idle"],
  ] as const)(
    "%s",
    (
      _label,
      runtimePatch,
      configurationStatus,
      activeRunCount,
      waitingRequestCount,
      pendingApprovalCount,
      expected,
    ) => {
      const runtime =
        runtimePatch === null
          ? null
          : { ...makeAgentRosterItem().runtime!, ...runtimePatch };

      expect(
        resolveAgentOfficeNodeStatus({
          runtime,
          configurationStatus,
          activeRunCount,
          waitingRequestCount,
          pendingApprovalCount,
        }),
      ).toBe(expected);
    },
  );
});
