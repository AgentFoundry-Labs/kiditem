import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AguiConnectionAuthorizationSchema,
  AguiRunAuthorizationSchema,
  DashboardContextSchema,
  type AguiConnectionAuthorization,
  type AguiRunAuthorization,
  type DashboardContext,
} from '@kiditem/shared/agent-interaction';
import {
  AgentDefinitionKeySchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  AguiRunIdSchema,
  CopilotThreadIdSchema,
  NonNegativeDecimalSequenceSchema,
  OpaqueReplayCursorSchema,
  OpaqueShortLivedTokenSchema,
  OrganizationIdSchema,
  OrganizationNameSchema,
  UserIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatOrganizationName,
  formatUserName,
  parseAgentSessionName,
  parseOrganizationName,
  parseUserName,
} from '@kiditem/shared/identifiers';
import type {
  AgentInteractionAuthorizationPort,
  AgentInteractionConnectionAuthorization,
  AuthorizeConnectionInput,
  AuthorizeCurrentRunInput,
  AuthorizeLiveJoinInput,
  AuthorizeRunInput,
  AuthorizedCurrentRun,
  AuthorizedLiveJoin,
} from '../../port/in/interaction/agent-interaction-authorization.port';
import {
  AGENT_INTERACTION_REPOSITORY,
  type ActiveAgentVersionRecord,
  type AgentInteractionRepositoryPort,
  type AgentSessionRecord,
  type AuthorizedExecutionRecord,
} from '../../port/out/repository/agent-interaction-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import {
  INTERACTION_CLOCK,
  INTERACTION_REPLAY_CURSOR_HMAC_KEY,
  INTERACTION_RUN_INTENT_HMAC_KEY,
  type InteractionClock,
} from '../agent-interaction.tokens';
import {
  LIVE_JOIN_DOMAIN,
  LIVE_JOIN_TTL_MS,
  LiveJoinClaimsSchema,
  REPLAY_CURSOR_DOMAIN,
  REPLAY_CURSOR_TTL_MS,
  ReplayCursorClaimsSchema,
  RUN_INTENT_DOMAIN,
  RunIntentClaimsSchema,
  UserEventSchema,
  InteractionTokenCodec,
  type RunIntentClaims,
} from './interaction-token-codec';
import {
  AUTHORITY_PROFILE_VERSION_ID,
  FOUNDATION_CAPABILITY_KEYS,
  foundationAuthorityProfilePolicyDocument,
  foundationAuthorityProfilePolicyHash,
  foundationPolicyHash,
} from './interaction-authority-profile';
import { InteractionAllowedVersionResolver } from './interaction-allowed-version-resolver';
import { InteractionReplayProjector } from './interaction-replay-projector';

const REPLAY_LIMIT = 500;

@Injectable()
export class AgentInteractionAuthorizationService implements AgentInteractionAuthorizationPort {
  private readonly replayProjector = new InteractionReplayProjector();

  constructor(
    @Inject(AGENT_INTERACTION_REPOSITORY)
    private readonly repository: AgentInteractionRepositoryPort,
    @Inject(INTERACTION_CLOCK) private readonly now: InteractionClock,
    @Inject(INTERACTION_RUN_INTENT_HMAC_KEY)
    private readonly runIntentHmacKey: Buffer,
    @Inject(INTERACTION_REPLAY_CURSOR_HMAC_KEY)
    private readonly replayCursorHmacKey: Buffer,
    private readonly versions: InteractionAllowedVersionResolver,
  ) {}

  async authorizeRun(input: AuthorizeRunInput): Promise<AguiRunAuthorization> {
    const claims = InteractionTokenCodec.verify(
      input.runIntent,
      this.runIntentHmacKey,
      RUN_INTENT_DOMAIN,
      RunIntentClaimsSchema,
      'INTERACTION_RUN_INTENT_INVALID',
    );
    if (claims.expiresAtMs <= this.now().getTime()) {
      throw boundary('INTERACTION_RUN_INTENT_EXPIRED', 'The interaction run intent has expired.');
    }
    const dashboardContext = parseInput(
      DashboardContextSchema,
      input.dashboardContext,
      'INTERACTION_DASHBOARD_CONTEXT_INVALID',
    );
    const userEvent = parseInput(UserEventSchema, input.userEvent, 'INTERACTION_USER_EVENT_INVALID');
    const copilotThreadId = parseInput(
      CopilotThreadIdSchema,
      input.copilotThreadId,
      'INTERACTION_RUN_INTENT_MISMATCH',
    );
    const aguiRunId = parseInput(AguiRunIdSchema, input.aguiRunId, 'INTERACTION_RUN_INTENT_MISMATCH');
    this.assertRunIntentRequest(claims, copilotThreadId, aguiRunId, dashboardContext, userEvent);

    const organizationId = parseOrganizationName(claims.organization).organization;
    const userId = parseUserName(claims.user).user;
    const version = await this.versions.resolveFromName(claims.agentVersion);
    if (!version) {
      throw boundary(
        'INTERACTION_RUN_INTENT_STATE_MISMATCH',
        'The approved agent version is no longer active.',
      );
    }
    this.assertCurrentVersion(claims, version);

    const authorized = await this.repository.authorizeExecution({
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
      capabilityKeys: [...FOUNDATION_CAPABILITY_KEYS],
      policyHash: claims.policyHash,
      inputHash: claims.inputHash,
      currentInput: { dashboardContext, userEvent },
      currentResourceRefs: dashboardContext.resourceRefs,
      userEvent,
    });
    this.assertAuthorizedRecord(authorized, {
      organizationId,
      userId,
      copilotThreadId,
      aguiRunId,
      version,
    });

    return parseShared(AguiRunAuthorizationSchema, {
      session: formatAgentSessionName(organizationId, AgentSessionIdSchema.parse(authorized.session.id)),
      task: formatAgentSessionTaskName(
        organizationId,
        AgentSessionIdSchema.parse(authorized.session.id),
        AgentSessionTaskIdSchema.parse(authorized.rootTask.id),
      ),
      execution: formatAgentExecutionName(
        organizationId,
        AgentSessionIdSchema.parse(authorized.session.id),
        AgentExecutionIdSchema.parse(authorized.execution.id),
      ),
      modelIdentity: authorized.execution.modelIdentity,
      runtimeType: authorized.execution.runtimeType,
      policyHash: authorized.policy.policyHash,
      contextEpoch: authorized.contextEpoch,
      dashboardContext,
    });
  }

  async authorizeConnection(
    input: AuthorizeConnectionInput,
  ): Promise<AgentInteractionConnectionAuthorization> {
    const organizationId = parseInput(
      OrganizationIdSchema,
      input.organizationId,
      'INTERACTION_CONNECTION_NOT_AUTHORIZED',
    );
    const userId = parseInput(UserIdSchema, input.userId, 'INTERACTION_CONNECTION_NOT_AUTHORIZED');
    const copilotThreadId = parseInput(
      CopilotThreadIdSchema,
      input.copilotThreadId,
      'INTERACTION_CONNECTION_NOT_AUTHORIZED',
    );
    const session = await this.requireAccessibleSession(organizationId, userId, copilotThreadId);
    const version = await this.versions.resolveById(
      'operator',
      session.primaryAgentVersionId,
    );
    if (!version) {
      throw boundary(
        'INTERACTION_CONNECTION_NOT_AUTHORIZED',
        'The requested Agent OS session has no active agent version.',
      );
    }
    const sessionName = formatAgentSessionName(organizationId, AgentSessionIdSchema.parse(session.id));
    const afterSequence = input.cursor
      ? this.verifyReplayCursor(input.cursor, { organizationId, userId, copilotThreadId, session, sessionName })
      : 0n;
    const page = await this.repository.readConversationEvents({
      organizationId,
      userId,
      sessionId: session.id,
      afterSequence,
      limit: REPLAY_LIMIT,
    });
    const nextCursor = page.hasMore ? this.createReplayCursor({
      organizationId,
      userId,
      copilotThreadId,
      sessionName,
      afterSequence: page.lastSequence,
    }) : null;
    const liveJoinExpiresAt = page.hasMore ? null : new Date(this.now().getTime() + LIVE_JOIN_TTL_MS);
    const liveJoinToken = liveJoinExpiresAt
      ? this.createLiveJoinToken({
        organizationId,
        userId,
        sessionName,
        copilotThreadId,
        contextEpoch: session.contextEpoch,
        afterSequence: page.lastSequence,
        expiresAtMs: liveJoinExpiresAt.getTime(),
      })
      : null;
    const replay = this.replayProjector.project(organizationId, session, page, nextCursor);
    const authorization = parseShared(AguiConnectionAuthorizationSchema, {
      session: sessionName,
      contextEpoch: session.contextEpoch,
      replay: {
        nextCursor,
        lastSequence: NonNegativeDecimalSequenceSchema.parse(page.lastSequence.toString()),
      },
    });
    return {
      authorization,
      replay,
      liveJoinToken,
      liveJoinExpiresAt: liveJoinExpiresAt?.toISOString() ?? null,
    };
  }

  async authorizeCurrentRun(input: AuthorizeCurrentRunInput): Promise<AuthorizedCurrentRun | null> {
    const organizationId = parseInput(
      OrganizationIdSchema,
      input.organizationId,
      'INTERACTION_CONNECTION_NOT_AUTHORIZED',
    );
    const userId = parseInput(UserIdSchema, input.userId, 'INTERACTION_CONNECTION_NOT_AUTHORIZED');
    const agentDefinitionKey = parseInput(
      AgentDefinitionKeySchema,
      input.agentDefinitionKey,
      'INTERACTION_CONNECTION_NOT_AUTHORIZED',
    );
    const copilotThreadId = parseInput(
      CopilotThreadIdSchema,
      input.copilotThreadId,
      'INTERACTION_CONNECTION_NOT_AUTHORIZED',
    );
    const session = await this.requireAccessibleSession(organizationId, userId, copilotThreadId);
    const execution = await this.repository.findAccessibleCurrentExecution({
      organizationId,
      userId,
      sessionId: session.id,
      copilotThreadId,
    });
    if (
      !execution ||
      execution.status !== 'running' ||
      execution.organizationId !== organizationId ||
      execution.sessionId !== session.id ||
      execution.copilotThreadId !== copilotThreadId ||
      execution.agentDefinitionKey !== agentDefinitionKey
    ) {
      return null;
    }
    return {
      session: formatAgentSessionName(organizationId, AgentSessionIdSchema.parse(session.id)),
      execution: formatAgentExecutionName(
        organizationId,
        AgentSessionIdSchema.parse(session.id),
        AgentExecutionIdSchema.parse(execution.executionId),
      ),
      aguiRunId: AguiRunIdSchema.parse(execution.aguiRunId),
    };
  }

  async authorizeLiveJoin(input: AuthorizeLiveJoinInput): Promise<AuthorizedLiveJoin> {
    const claims = InteractionTokenCodec.verify(
      input.liveJoinToken,
      this.replayCursorHmacKey,
      LIVE_JOIN_DOMAIN,
      LiveJoinClaimsSchema,
      'INTERACTION_LIVE_JOIN_INVALID',
    );
    if (claims.expiresAtMs <= this.now().getTime()) {
      throw boundary('INTERACTION_LIVE_JOIN_EXPIRED', 'The live join authorization has expired.');
    }
    const copilotThreadId = parseInput(
      CopilotThreadIdSchema,
      input.copilotThreadId,
      'INTERACTION_LIVE_JOIN_MISMATCH',
    );
    if (claims.copilotThreadId !== copilotThreadId || claims.afterSequence !== input.afterSequence.toString()) {
      throw boundary(
        'INTERACTION_LIVE_JOIN_MISMATCH',
        'The live join authorization does not match the requested cursor.',
      );
    }
    const organizationId = parseOrganizationName(claims.organization).organization;
    const userId = parseUserName(claims.user).user;
    const parsedSession = parseAgentSessionName(claims.session, claims.organization);
    const session = await this.repository.findAccessibleSession({ organizationId, userId, copilotThreadId });
    if (
      !session ||
      session.id !== parsedSession.session ||
      session.lifecycle !== 'active' ||
      session.contextEpoch !== claims.contextEpoch
    ) {
      throw boundary('INTERACTION_LIVE_JOIN_MISMATCH', 'The live join session is no longer current.');
    }
    const definition = parseInput(
      AgentDefinitionKeySchema,
      input.agentDefinitionKey,
      'INTERACTION_LIVE_JOIN_MISMATCH',
    );
    const version = await this.versions.resolveById(
      definition,
      session.primaryAgentVersionId,
    );
    if (!version) {
      throw boundary('INTERACTION_LIVE_JOIN_MISMATCH', 'The live join agent version is not active.');
    }
    return {
      organizationId,
      userId,
      sessionId: session.id,
      copilotThreadId,
      contextEpoch: claims.contextEpoch,
      afterSequence: input.afterSequence,
    };
  }

  async health(): Promise<{ status: 'ok' }> {
    await this.versions.resolveAll();
    await this.repository.probeHealth();
    return { status: 'ok' };
  }

  private async requireAccessibleSession(
    organizationId: z.infer<typeof OrganizationIdSchema>,
    userId: z.infer<typeof UserIdSchema>,
    copilotThreadId: z.infer<typeof CopilotThreadIdSchema>,
  ): Promise<AgentSessionRecord> {
    const session = await this.repository.findAccessibleSession({ organizationId, userId, copilotThreadId });
    if (
      !session ||
      session.lifecycle !== 'active' ||
      session.organizationId !== organizationId ||
      session.createdByUserId !== userId ||
      session.copilotThreadId !== copilotThreadId
    ) {
      throw boundary(
        'INTERACTION_CONNECTION_NOT_AUTHORIZED',
        'The requested Agent OS session is not active and accessible.',
      );
    }
    return session;
  }

  private assertRunIntentRequest(
    claims: RunIntentClaims,
    copilotThreadId: z.infer<typeof CopilotThreadIdSchema>,
    aguiRunId: z.infer<typeof AguiRunIdSchema>,
    dashboardContext: DashboardContext,
    userEvent: z.infer<typeof UserEventSchema>,
  ): void {
    if (
      claims.copilotThreadId !== copilotThreadId ||
      claims.aguiRunId !== aguiRunId ||
      claims.dashboardContextHash !== InteractionTokenCodec.hash(dashboardContext) ||
      claims.inputHash !== InteractionTokenCodec.hash({ dashboardContext, userEvent })
    ) {
      throw boundary('INTERACTION_RUN_INTENT_MISMATCH', 'The request does not match its signed run intent.');
    }
  }

  private assertCurrentVersion(claims: RunIntentClaims, current: ActiveAgentVersionRecord): void {
    if (claims.policyHash !== foundationPolicyHash(current)) {
      throw boundary(
        'INTERACTION_RUN_INTENT_STATE_MISMATCH',
        'The agent version or policy changed after intent preparation.',
      );
    }
  }

  private assertAuthorizedRecord(
    record: AuthorizedExecutionRecord,
    expected: {
      organizationId: string;
      userId: string;
      copilotThreadId: string;
      aguiRunId: string;
      version: ActiveAgentVersionRecord;
    },
  ): void {
    if (
      record.session.organizationId !== expected.organizationId ||
      record.session.createdByUserId !== expected.userId ||
      record.session.copilotThreadId !== expected.copilotThreadId ||
      record.session.primaryAgentVersionId !== expected.version.id ||
      record.session.authorityProfileVersionId !== AUTHORITY_PROFILE_VERSION_ID ||
      record.rootTask.sessionId !== record.session.id ||
      record.execution.sessionId !== record.session.id ||
      record.execution.sessionTaskId !== record.rootTask.id ||
      record.execution.copilotThreadId !== expected.copilotThreadId ||
      record.execution.aguiRunId !== expected.aguiRunId ||
      record.execution.agentVersionId !== expected.version.id ||
      record.execution.runtimeType !== expected.version.runtimeType ||
      record.execution.modelIdentity !== expected.version.modelIdentity ||
      record.execution.policySnapshotId !== record.policy.id ||
      record.policy.sessionId !== record.session.id ||
      record.policy.agentVersionId !== expected.version.id ||
      record.policy.authorityProfileVersionId !== AUTHORITY_PROFILE_VERSION_ID
    ) {
      throw boundary(
        'INTERACTION_AUTHORIZATION_STATE_INVALID',
        'The authorization repository returned an inconsistent control graph.',
      );
    }
  }

  private verifyReplayCursor(
    cursor: string,
    input: {
      organizationId: z.infer<typeof OrganizationIdSchema>;
      userId: z.infer<typeof UserIdSchema>;
      copilotThreadId: z.infer<typeof CopilotThreadIdSchema>;
      session: AgentSessionRecord;
      sessionName: string;
    },
  ): bigint {
    const claims = InteractionTokenCodec.verify(
      cursor,
      this.replayCursorHmacKey,
      REPLAY_CURSOR_DOMAIN,
      ReplayCursorClaimsSchema,
      'INTERACTION_REPLAY_CURSOR_INVALID',
    );
    if (claims.expiresAtMs <= this.now().getTime()) {
      throw boundary('INTERACTION_REPLAY_CURSOR_EXPIRED', 'The replay cursor has expired.');
    }
    const organization = parseOrganizationName(claims.organization).organization;
    const user = parseUserName(claims.user).user;
    const session = parseAgentSessionName(claims.session, claims.organization);
    if (
      organization !== input.organizationId ||
      user !== input.userId ||
      session.session !== input.session.id ||
      claims.session !== input.sessionName ||
      claims.copilotThreadId !== input.copilotThreadId
    ) {
      throw boundary(
        'INTERACTION_REPLAY_CURSOR_MISMATCH',
        'The replay cursor does not belong to the requested session.',
      );
    }
    try {
      return BigInt(claims.afterSequence);
    } catch {
      throw boundary('INTERACTION_REPLAY_CURSOR_INVALID', 'The replay cursor is invalid.');
    }
  }

  private createReplayCursor(input: {
    organizationId: z.infer<typeof OrganizationIdSchema>;
    userId: z.infer<typeof UserIdSchema>;
    copilotThreadId: z.infer<typeof CopilotThreadIdSchema>;
    sessionName: string;
    afterSequence: bigint;
  }): string {
    return OpaqueReplayCursorSchema.parse(InteractionTokenCodec.sign({
      version: 1 as const,
      organization: formatOrganizationName(input.organizationId),
      user: formatUserName(input.userId),
      session: input.sessionName,
      copilotThreadId: input.copilotThreadId,
      afterSequence: NonNegativeDecimalSequenceSchema.parse(input.afterSequence.toString()),
      expiresAtMs: this.now().getTime() + REPLAY_CURSOR_TTL_MS,
    }, this.replayCursorHmacKey, REPLAY_CURSOR_DOMAIN));
  }

  private createLiveJoinToken(input: {
    organizationId: z.infer<typeof OrganizationIdSchema>;
    userId: z.infer<typeof UserIdSchema>;
    sessionName: string;
    copilotThreadId: z.infer<typeof CopilotThreadIdSchema>;
    contextEpoch: number;
    afterSequence: bigint;
    expiresAtMs: number;
  }): string {
    return OpaqueShortLivedTokenSchema.parse(InteractionTokenCodec.sign({
      version: 1 as const,
      organization: formatOrganizationName(input.organizationId),
      user: formatUserName(input.userId),
      session: input.sessionName,
      copilotThreadId: input.copilotThreadId,
      contextEpoch: input.contextEpoch,
      afterSequence: NonNegativeDecimalSequenceSchema.parse(input.afterSequence.toString()),
      expiresAtMs: input.expiresAtMs,
    }, this.replayCursorHmacKey, LIVE_JOIN_DOMAIN));
  }
}

function parseInput<T extends z.ZodTypeAny>(schema: T, value: unknown, code: string): z.infer<T> {
  return InteractionTokenCodec.parse(schema, value, code);
}

function parseShared<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return InteractionTokenCodec.response(schema, value);
}

function boundary(code: string, message: string): AgentOsBoundaryError {
  return new AgentOsBoundaryError(code, message);
}
