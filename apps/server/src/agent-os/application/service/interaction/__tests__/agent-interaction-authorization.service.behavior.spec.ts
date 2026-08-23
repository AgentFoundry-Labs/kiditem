import { describe, expect, it, vi } from "vitest";
import type {
  ActiveAgentVersionRecord,
  AuthorizedExecutionRecord,
} from "../../../port/out/repository/interaction/agent-interaction.persistence.types";
import { AgentInteractionAuthorizationService } from "../agent-interaction-authorization.service";
import { InteractionAllowedVersionResolver } from "../interaction-allowed-version-resolver";

const version: ActiveAgentVersionRecord = {
  id: "version-1", agentDefinitionKey: "operator", version: 1,
  displayName: "Operator", description: "", runtimeType: "copilotkit_agui",
  modelIdentity: "test-model", capabilityKeys: ["agent_os.platform_probe", "analytics.readOverview", "sourcing.retrieveWorkspaceEvidence", "sourcing.inspectRecommendationRun"], policyDocument: {},
  activatedAt: new Date(), retiredAt: null,
};
const session = {
  id: "session-1", organizationId: "organization-1", createdByUserId: "user-1",
  copilotThreadId: "thread-1", primaryAgentVersionId: "version-1",
  authorityProfileVersionId: "foundation_read_only_probe:v1", contextEpoch: 1,
  title: null, lastEventSequence: 0n, lifecycle: "active", completedAt: null,
  cancelledAt: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
};
const authorization = {
  createdSession: true, session, contextEpoch: 1,
  rootTask: { id: "task-1", sessionId: "session-1" },
  policy: { id: "policy-1", sessionId: "session-1", agentVersionId: "version-1", policyHash: "a".repeat(64) },
  execution: { id: "execution-1", sessionId: "session-1", sessionTaskId: "task-1", copilotThreadId: "thread-1", aguiRunId: "run-1", agentVersionId: "version-1", runtimeType: "copilotkit_agui", modelIdentity: "test-model" },
} as AuthorizedExecutionRecord;

function subject() {
  const repository = {
    listActiveAgentVersions: vi.fn(async () => [version]),
    findActiveAgentVersion: vi.fn(async () => version),
    findKnownAgentVersion: vi.fn(async () => version),
    findAccessibleSession: vi.fn(async () => session),
    readConversationEvents: vi.fn(async () => ({ events: [], lastSequence: 0n, hasMore: false })),
    findAccessibleCurrentExecution: vi.fn(async () => null),
    authorizeExecution: vi.fn(async () => authorization),
    probeHealth: vi.fn(async () => undefined),
  };
  return {
    repository,
    service: new AgentInteractionAuthorizationService(
      repository as never, repository as never, repository as never,
      repository as never, repository as never,
      new InteractionAllowedVersionResolver(repository as never),
    ),
  };
}

const dashboardContext = { routeKey: "global", resourceRefs: [], filters: {}, visibleRowIds: [], aggregateSummary: {}, locale: "ko-KR", timezone: "Asia/Seoul" };
const userEvent = { externalEventId: "message-1", schemaVersion: 1 as const, payload: { phase: "complete" as const, messageId: "message-1", content: "hello" } };

describe("AgentInteractionAuthorizationService", () => {
  it("authorizes a run from the immutable authenticated principal without a browser credential", async () => {
    const { service, repository } = subject();
    await service.authorizeRun({ organizationId: "organization-1", userId: "user-1", agentDefinitionKey: "operator", copilotThreadId: "thread-1", aguiRunId: "run-1", dashboardContext, userEvent });
    expect(repository.authorizeExecution).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "organization-1", userId: "user-1", agentVersionId: "version-1" }));
  });

  it("uses a decimal sequence as position only and returns an in-process live coordinate", async () => {
    const { service } = subject();
    const result = await service.authorizeConnection({ organizationId: "organization-1", userId: "user-1", agentDefinitionKey: "operator", copilotThreadId: "thread-1", afterSequence: "0" });
    expect(result.liveCoordinate).toMatchObject({ organizationId: "organization-1", userId: "user-1", afterSequence: 0n });
  });

  it("authorizes an existing session against its immutable retired version without using it for a new run", async () => {
    const { service, repository } = subject();
    const retired = { ...version, retiredAt: new Date() };
    repository.findKnownAgentVersion = vi.fn(async () => retired);

    await expect(service.authorizeConnection({
      organizationId: "organization-1", userId: "user-1", agentDefinitionKey: "operator", copilotThreadId: "thread-1", afterSequence: "0",
    })).resolves.toMatchObject({ liveCoordinate: expect.anything() });
    expect(repository.findKnownAgentVersion).toHaveBeenCalledWith({ agentDefinitionKey: "operator", agentVersionId: "version-1" });
    expect(repository.authorizeExecution).not.toHaveBeenCalled();
  });
});
