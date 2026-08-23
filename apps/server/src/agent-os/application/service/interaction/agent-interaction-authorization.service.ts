import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  AguiConnectionAuthorizationSchema,
  AguiRunAuthorizationSchema,
  DashboardContextSchema,
  type AguiRunAuthorization,
} from "@kiditem/shared/agent-interaction";
import {
  AgentDefinitionKeySchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  AguiRunIdSchema,
  CopilotThreadIdSchema,
  NonNegativeDecimalSequenceSchema,
  OrganizationIdSchema,
  UserIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
} from "@kiditem/shared/identifiers";
import type {
  AgentInteractionAuthorizationPort,
  AgentInteractionConnectionAuthorization,
  AuthorizeConnectionInput,
  AuthorizeCurrentRunInput,
  AuthorizeRunInput,
  AuthorizedCurrentRun,
} from "../../port/in/interaction/agent-interaction-authorization.port";
import type {
  ActiveAgentVersionRecord,
  AgentSessionRecord,
  AuthorizedExecutionRecord,
} from "../../port/out/repository/interaction/agent-interaction.persistence.types";
import {
  AGENT_SESSION_QUERY_REPOSITORY,
  type AgentSessionQueryRepositoryPort,
} from "../../port/out/repository/interaction/agent-session-query.repository.port";
import {
  AGENT_CONVERSATION_QUERY_REPOSITORY,
  type AgentConversationQueryRepositoryPort,
} from "../../port/out/repository/interaction/agent-conversation-query.repository.port";
import {
  AGENT_EXECUTION_QUERY_REPOSITORY,
  type AgentExecutionQueryRepositoryPort,
} from "../../port/out/repository/interaction/agent-execution-query.repository.port";
import {
  AGENT_RUN_AUTHORIZATION_TRANSACTION,
  type AgentRunAuthorizationTransactionPort,
} from "../../port/out/transaction/interaction/agent-run-authorization.transaction.port";
import {
  AGENT_VERSION_REPOSITORY,
  type AgentVersionRepositoryPort,
} from "../../port/out/repository/agent-version.repository.port";
import { AgentOsBoundaryError } from "../../../domain/agent-os.errors";
import {
  AUTHORITY_PROFILE_VERSION_ID,
  FOUNDATION_CAPABILITY_KEYS,
  foundationAuthorityProfilePolicyDocument,
  foundationAuthorityProfilePolicyHash,
  foundationPolicyHash,
  interactionCapabilityKeys,
} from "./interaction-authority-profile";
import { interactionHash } from "./interaction-canonical";
import { InteractionAllowedVersionResolver } from "./interaction-allowed-version-resolver";
import { InteractionReplayProjector } from "./interaction-replay-projector";
import { UserEventSchema } from "../../port/in/interaction/agent-interaction-input.contract";

const REPLAY_LIMIT = 500;

@Injectable()
export class AgentInteractionAuthorizationService implements AgentInteractionAuthorizationPort {
  private readonly replayProjector = new InteractionReplayProjector();

  constructor(
    @Inject(AGENT_SESSION_QUERY_REPOSITORY) private readonly sessions: AgentSessionQueryRepositoryPort,
    @Inject(AGENT_CONVERSATION_QUERY_REPOSITORY) private readonly conversations: AgentConversationQueryRepositoryPort,
    @Inject(AGENT_EXECUTION_QUERY_REPOSITORY) private readonly executions: AgentExecutionQueryRepositoryPort,
    @Inject(AGENT_RUN_AUTHORIZATION_TRANSACTION) private readonly runAuthorization: AgentRunAuthorizationTransactionPort,
    @Inject(AGENT_VERSION_REPOSITORY) private readonly versionsRepository: AgentVersionRepositoryPort,
    private readonly versions: InteractionAllowedVersionResolver,
  ) {}

  async authorizeRun(input: AuthorizeRunInput): Promise<AguiRunAuthorization> {
    const organizationId = parse(OrganizationIdSchema, input.organizationId, "INTERACTION_RUN_NOT_AUTHORIZED");
    const userId = parse(UserIdSchema, input.userId, "INTERACTION_RUN_NOT_AUTHORIZED");
    const definition = parse(AgentDefinitionKeySchema, input.agentDefinitionKey, "AGENT_NOT_ALLOWED");
    const copilotThreadId = parse(CopilotThreadIdSchema, input.copilotThreadId, "INTERACTION_RUN_NOT_AUTHORIZED");
    const aguiRunId = parse(AguiRunIdSchema, input.aguiRunId, "INTERACTION_RUN_NOT_AUTHORIZED");
    const dashboardContext = parse(DashboardContextSchema, input.dashboardContext, "INTERACTION_DASHBOARD_CONTEXT_INVALID");
    const userEvent = parse(UserEventSchema, input.userEvent, "INTERACTION_USER_EVENT_INVALID");
    const version = await this.requireAllowedVersion(definition);
    const authorized = await this.runAuthorization.authorizeExecution({
      organizationId,
      userId,
      copilotThreadId,
      aguiRunId,
      agentVersionId: version.id,
      runtimeType: version.runtimeType,
      modelIdentity: version.modelIdentity,
      authorityProfileVersionId: AUTHORITY_PROFILE_VERSION_ID,
      authorityProfilePolicyDocument: foundationAuthorityProfilePolicyDocument(),
      authorityProfilePolicyHash: foundationAuthorityProfilePolicyHash(),
      authorityProfileCapabilityKeys: [...FOUNDATION_CAPABILITY_KEYS],
      capabilityKeys: interactionCapabilityKeys(version),
      policyHash: foundationPolicyHash(version),
      inputHash: interactionHash({ dashboardContext, userEvent }),
      currentInput: { dashboardContext, userEvent },
      currentResourceRefs: dashboardContext.resourceRefs,
      userEvent,
    });
    this.assertAuthorizedRecord(authorized, { organizationId, userId, copilotThreadId, aguiRunId, version });
    return AguiRunAuthorizationSchema.parse({
      session: formatAgentSessionName(organizationId, AgentSessionIdSchema.parse(authorized.session.id)),
      task: formatAgentSessionTaskName(organizationId, AgentSessionIdSchema.parse(authorized.session.id), AgentSessionTaskIdSchema.parse(authorized.rootTask.id)),
      execution: formatAgentExecutionName(organizationId, AgentSessionIdSchema.parse(authorized.session.id), AgentExecutionIdSchema.parse(authorized.execution.id)),
      modelIdentity: authorized.execution.modelIdentity,
      runtimeType: authorized.execution.runtimeType,
      policyHash: authorized.policy.policyHash,
      contextEpoch: authorized.contextEpoch,
      dashboardContext,
    });
  }

  async authorizeConnection(input: AuthorizeConnectionInput): Promise<AgentInteractionConnectionAuthorization> {
    const organizationId = parse(OrganizationIdSchema, input.organizationId, "INTERACTION_CONNECTION_NOT_AUTHORIZED");
    const userId = parse(UserIdSchema, input.userId, "INTERACTION_CONNECTION_NOT_AUTHORIZED");
    const definition = parse(AgentDefinitionKeySchema, input.agentDefinitionKey, "INTERACTION_CONNECTION_NOT_AUTHORIZED");
    const copilotThreadId = parse(CopilotThreadIdSchema, input.copilotThreadId, "INTERACTION_CONNECTION_NOT_AUTHORIZED");
    const afterSequence = this.parseSequence(input.afterSequence);
    const session = await this.requireAccessibleSession(organizationId, userId, copilotThreadId);
    const version = await this.versions.resolveKnownById(definition, session.primaryAgentVersionId);
    if (!version) throw boundary("INTERACTION_CONNECTION_NOT_AUTHORIZED", "The requested Agent OS session has no known agent version.");
    const page = await this.conversations.readConversationEvents({ organizationId, userId, sessionId: session.id, afterSequence, limit: REPLAY_LIMIT });
    const sessionName = formatAgentSessionName(organizationId, AgentSessionIdSchema.parse(session.id));
    const replay = this.replayProjector.project(organizationId, session, page, page.hasMore ? page.lastSequence.toString() : null);
    return {
      authorization: AguiConnectionAuthorizationSchema.parse({
        session: sessionName,
        contextEpoch: session.contextEpoch,
        replay: { nextCursor: page.hasMore ? NonNegativeDecimalSequenceSchema.parse(page.lastSequence.toString()) : null, lastSequence: NonNegativeDecimalSequenceSchema.parse(page.lastSequence.toString()) },
      }),
      replay,
      liveCoordinate: page.hasMore ? null : { organizationId, userId, sessionId: session.id, copilotThreadId, contextEpoch: session.contextEpoch, afterSequence: page.lastSequence },
    };
  }

  async authorizeCurrentRun(input: AuthorizeCurrentRunInput): Promise<AuthorizedCurrentRun | null> {
    const organizationId = parse(OrganizationIdSchema, input.organizationId, "INTERACTION_CONNECTION_NOT_AUTHORIZED");
    const userId = parse(UserIdSchema, input.userId, "INTERACTION_CONNECTION_NOT_AUTHORIZED");
    const definition = parse(AgentDefinitionKeySchema, input.agentDefinitionKey, "INTERACTION_CONNECTION_NOT_AUTHORIZED");
    const copilotThreadId = parse(CopilotThreadIdSchema, input.copilotThreadId, "INTERACTION_CONNECTION_NOT_AUTHORIZED");
    const session = await this.requireAccessibleSession(organizationId, userId, copilotThreadId);
    const execution = await this.executions.findAccessibleCurrentExecution({ organizationId, userId, sessionId: session.id, copilotThreadId });
    if (!execution || execution.status !== "running" || execution.agentDefinitionKey !== definition || !execution.attemptId || !execution.startIntentId) return null;
    return {
      session: formatAgentSessionName(organizationId, AgentSessionIdSchema.parse(session.id)),
      execution: formatAgentExecutionName(organizationId, AgentSessionIdSchema.parse(session.id), AgentExecutionIdSchema.parse(execution.executionId)),
      aguiRunId: AguiRunIdSchema.parse(execution.aguiRunId),
      attemptId: execution.attemptId,
      startIntentId: execution.startIntentId,
    };
  }

  async health(): Promise<{ status: "ok" }> {
    await this.versions.resolveAll();
    await this.versionsRepository.probeHealth();
    return { status: "ok" };
  }

  private async requireAllowedVersion(definition: string): Promise<ActiveAgentVersionRecord> {
    const match = (await this.versions.resolveAll()).find((version) => version.agentDefinitionKey === definition);
    if (!match) throw boundary("AGENT_NOT_ALLOWED", "The requested interaction agent is not server-approved.");
    return match;
  }

  private async requireAccessibleSession(organizationId: string, userId: string, copilotThreadId: string): Promise<AgentSessionRecord> {
    const session = await this.sessions.findAccessibleSession({ organizationId, userId, copilotThreadId });
    if (!session || session.lifecycle !== "active" || session.organizationId !== organizationId || session.createdByUserId !== userId || session.copilotThreadId !== copilotThreadId) {
      throw boundary("INTERACTION_CONNECTION_NOT_AUTHORIZED", "The requested Agent OS session is not active and accessible.");
    }
    return session;
  }

  private parseSequence(value: string | null | undefined): bigint {
    if (value == null) return 0n;
    const parsed = parse(NonNegativeDecimalSequenceSchema, value, "INTERACTION_REPLAY_SEQUENCE_INVALID");
    return BigInt(parsed);
  }

  private assertAuthorizedRecord(record: AuthorizedExecutionRecord, expected: { organizationId: string; userId: string; copilotThreadId: string; aguiRunId: string; version: ActiveAgentVersionRecord }): void {
    if (record.session.organizationId !== expected.organizationId || record.session.createdByUserId !== expected.userId || record.session.copilotThreadId !== expected.copilotThreadId || record.session.primaryAgentVersionId !== expected.version.id || record.rootTask.sessionId !== record.session.id || record.execution.sessionId !== record.session.id || record.execution.sessionTaskId !== record.rootTask.id || record.execution.copilotThreadId !== expected.copilotThreadId || record.execution.aguiRunId !== expected.aguiRunId || record.execution.agentVersionId !== expected.version.id || record.policy.sessionId !== record.session.id || record.policy.agentVersionId !== expected.version.id) {
      throw boundary("INTERACTION_AUTHORIZATION_STATE_INVALID", "The authorization repository returned an inconsistent control graph.");
    }
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown, code: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw boundary(code, "The interaction request is invalid.");
  return result.data;
}

function boundary(code: string, message: string): AgentOsBoundaryError {
  return new AgentOsBoundaryError(code, message);
}
