import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AgentConversationEventEnvelopeSchema,
  AgentConversationReplaySchema,
  AguiConnectionAuthorizationSchema,
  AguiRunAuthorizationSchema,
  AguiRunIntentSchema,
  AllowedAgentSchema,
  DashboardContextSchema,
  InteractionBootstrapSchema,
  UserMessageEventPayloadSchema,
  type AgentConversationReplay,
  type AguiConnectionAuthorization,
  type AguiRunAuthorization,
  type AguiRunIntent,
  type AgentSessionSummary,
  type DashboardContext,
  type InteractionBootstrap,
} from '@kiditem/shared/agent-interaction';
import {
  AgentDefinitionKeySchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  AgentVersionKeySchema,
  AgentVersionNameSchema,
  AguiRunIdSchema,
  CopilotThreadIdSchema,
  formatAgentConversationEventName,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatAgentVersionName,
  formatOrganizationName,
  formatUserName,
  NonNegativeDecimalSequenceSchema,
  OrganizationIdSchema,
  OrganizationNameSchema,
  OpaqueReplayCursorSchema,
  OpaqueShortLivedTokenSchema,
  parseAgentSessionName,
  parseAgentVersionName,
  parseOrganizationName,
  parseUserName,
  PositiveDecimalSequenceSchema,
  Sha256DigestSchema,
  UserIdSchema,
  UserNameSchema,
} from '@kiditem/shared/identifiers';
import {
  AGENT_INTERACTION_REPOSITORY,
  type ActiveAgentVersionRecord,
  type AgentConversationEventRecord,
  type AgentInteractionRepositoryPort,
  type AgentSessionRecord,
  type AuthorizedExecutionRecord,
  type ConversationEventPage,
} from '../../port/out/repository/agent-interaction-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import { listAgentDefinitions } from '../../../domain/agent-definition.registry';
import {
  INTERACTION_CLOCK,
  INTERACTION_PRINCIPAL_HMAC_KEY,
  INTERACTION_REPLAY_CURSOR_HMAC_KEY,
  INTERACTION_RUN_INTENT_HMAC_KEY,
  type InteractionClock,
} from '../agent-interaction.tokens';

const RUN_INTENT_TTL_MS = 30_000;
const LIVE_JOIN_TTL_MS = 15_000;
const REPLAY_CURSOR_TTL_MS = 15 * 60_000;
const REPLAY_LIMIT = 500;

export const AUTHORITY_PROFILE_VERSION_ID = 'foundation_read_only_probe:v1';
export const FOUNDATION_CAPABILITY_KEYS = [
  'agent_os.platform_probe',
  'analytics.readOverview',
  'sourcing.retrieveWorkspaceEvidence',
  'sourcing.inspectRecommendationRun',
] as const;

const RUN_INTENT_DOMAIN = 'kiditem.agent-os.run-intent.v1';
const REPLAY_CURSOR_DOMAIN = 'kiditem.agent-os.replay-cursor.v1';
const LIVE_JOIN_DOMAIN = 'kiditem.agent-os.live-join.v1';

const UserEventSchema = z
  .object({
    externalEventId: z.string().min(1).max(128),
    schemaVersion: z.literal(1),
    payload: UserMessageEventPayloadSchema,
  })
  .strict();

const RunIntentClaimsSchema = z
  .object({
    version: z.literal(1),
    organization: OrganizationNameSchema,
    user: UserNameSchema,
    agentVersion: AgentVersionNameSchema,
    copilotThreadId: CopilotThreadIdSchema,
    aguiRunId: AguiRunIdSchema,
    dashboardContextHash: Sha256DigestSchema,
    policyHash: Sha256DigestSchema,
    inputHash: Sha256DigestSchema,
    expiresAtMs: z.number().int().positive(),
  })
  .strict();

const ReplayCursorClaimsSchema = z
  .object({
    version: z.literal(1),
    organization: OrganizationNameSchema,
    user: UserNameSchema,
    session: z.string().min(1).max(512),
    copilotThreadId: CopilotThreadIdSchema,
    afterSequence: NonNegativeDecimalSequenceSchema,
    expiresAtMs: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      parseAgentSessionName(value.session, value.organization);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['session'],
        message: 'session must belong to the claimed organization',
      });
    }
  });

const LiveJoinClaimsSchema = z
  .object({
    version: z.literal(1),
    organization: OrganizationNameSchema,
    user: UserNameSchema,
    session: z.string().min(1).max(512),
    copilotThreadId: CopilotThreadIdSchema,
    contextEpoch: z.number().int().positive(),
    afterSequence: NonNegativeDecimalSequenceSchema,
    expiresAtMs: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      parseAgentSessionName(value.session, value.organization);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['session'],
        message: 'session must belong to the claimed organization',
      });
    }
  });

type RunIntentClaims = z.infer<typeof RunIntentClaimsSchema>;

interface IdentityInput {
  organizationId: string;
  userId: string;
}

interface PrepareRunIntentInput extends IdentityInput {
  agentDefinitionKey: string;
  copilotThreadId: string;
  aguiRunId: string;
  dashboardContext: unknown;
  userEvent: unknown;
}

interface AuthorizeRunInput {
  runIntent: string;
  copilotThreadId: string;
  aguiRunId: string;
  dashboardContext: unknown;
  userEvent: unknown;
}

interface AuthorizeConnectionInput extends IdentityInput {
  copilotThreadId: string;
  cursor?: string | null;
}

interface AuthorizeCurrentRunInput extends IdentityInput {
  agentDefinitionKey: string;
  copilotThreadId: string;
}

export interface InteractionPrincipal {
  readonly principalKey: string;
}

export interface AuthorizedLiveJoin {
  readonly organizationId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly copilotThreadId: string;
  readonly contextEpoch: number;
  readonly afterSequence: bigint;
}

/**
 * Server-private composition of the narrow public connection grant and its
 * bounded replay page. The public grant itself deliberately contains no
 * execution authority; the private AG-UI boundary consumes this result.
 */
export interface AgentInteractionConnectionAuthorization {
  readonly authorization: AguiConnectionAuthorization;
  readonly replay: AgentConversationReplay;
  readonly liveJoinToken: string | null;
  readonly liveJoinExpiresAt: string | null;
}

@Injectable()
export class AgentInteractionAuthorizationService {
  constructor(
    @Inject(AGENT_INTERACTION_REPOSITORY)
    private readonly repository: AgentInteractionRepositoryPort,
    @Inject(INTERACTION_CLOCK) private readonly now: InteractionClock,
    @Inject(INTERACTION_PRINCIPAL_HMAC_KEY)
    private readonly principalHmacKey: Buffer,
    @Inject(INTERACTION_RUN_INTENT_HMAC_KEY)
    private readonly runIntentHmacKey: Buffer,
    @Inject(INTERACTION_REPLAY_CURSOR_HMAC_KEY)
    private readonly replayCursorHmacKey: Buffer,
  ) {}

  resolvePrincipal(input: IdentityInput): InteractionPrincipal {
    const organizationId = parseInput(
      OrganizationIdSchema,
      input.organizationId,
      'INTERACTION_PRINCIPAL_INVALID',
    );
    const userId = parseInput(
      UserIdSchema,
      input.userId,
      'INTERACTION_PRINCIPAL_INVALID',
    );
    const digest = createHmac('sha256', this.principalHmacKey)
      .update('kiditem.agent-os.principal.v1\0')
      .update(canonicalJson([organizationId, userId]))
      .digest('base64url');
    return { principalKey: `ei_${digest}` };
  }

  async bootstrap(input: IdentityInput): Promise<InteractionBootstrap> {
    const versions = await this.allowedVersions();
    const sessions = await this.repository.listSessions({
      organizationId: input.organizationId,
      userId: input.userId,
      limit: 50,
    });
    return parseShared(InteractionBootstrapSchema, {
      defaultAgentDefinitionKey: AgentDefinitionKeySchema.parse('operator'),
      agents: versions.map((version) => this.allowedAgent(version)),
      sessions,
    });
  }

  async prepareRunIntent(input: PrepareRunIntentInput): Promise<AguiRunIntent> {
    const organizationId = parseInput(
      OrganizationIdSchema,
      input.organizationId,
      'INTERACTION_PRINCIPAL_INVALID',
    );
    const userId = parseInput(
      UserIdSchema,
      input.userId,
      'INTERACTION_PRINCIPAL_INVALID',
    );
    const definition = parseInput(
      AgentDefinitionKeySchema,
      input.agentDefinitionKey,
      'AGENT_NOT_ALLOWED',
    );
    const copilotThreadId = parseInput(
      CopilotThreadIdSchema,
      input.copilotThreadId,
      'INTERACTION_RUN_INTENT_MISMATCH',
    );
    const aguiRunId = parseInput(
      AguiRunIdSchema,
      input.aguiRunId,
      'INTERACTION_RUN_INTENT_MISMATCH',
    );
    const version = await this.requireAllowedVersion(definition);
    const dashboardContext = parseInput(
      DashboardContextSchema,
      input.dashboardContext,
      'INTERACTION_DASHBOARD_CONTEXT_INVALID',
    );
    const userEvent = parseInput(
      UserEventSchema,
      input.userEvent,
      'INTERACTION_USER_EVENT_INVALID',
    );
    const expiresAt = new Date(this.now().getTime() + RUN_INTENT_TTL_MS);
    const claims = this.createRunIntentClaims({
      organizationId,
      userId,
      copilotThreadId,
      aguiRunId,
      version,
      dashboardContext,
      userEvent,
      expiresAtMs: expiresAt.getTime(),
    });
    return parseShared(AguiRunIntentSchema, {
      runIntent: OpaqueShortLivedTokenSchema.parse(
        signClaims(claims, this.runIntentHmacKey, RUN_INTENT_DOMAIN),
      ),
      expiresAt: expiresAt.toISOString(),
      copilotThreadId,
      aguiRunId,
    });
  }

  async authorizeRun(input: AuthorizeRunInput): Promise<AguiRunAuthorization> {
    const claims = verifyClaims(
      input.runIntent,
      this.runIntentHmacKey,
      RUN_INTENT_DOMAIN,
      RunIntentClaimsSchema,
      'INTERACTION_RUN_INTENT_INVALID',
    );
    if (claims.expiresAtMs <= this.now().getTime()) {
      throw boundary(
        'INTERACTION_RUN_INTENT_EXPIRED',
        'The interaction run intent has expired.',
      );
    }
    const dashboardContext = parseInput(
      DashboardContextSchema,
      input.dashboardContext,
      'INTERACTION_DASHBOARD_CONTEXT_INVALID',
    );
    const userEvent = parseInput(
      UserEventSchema,
      input.userEvent,
      'INTERACTION_USER_EVENT_INVALID',
    );
    const copilotThreadId = parseInput(
      CopilotThreadIdSchema,
      input.copilotThreadId,
      'INTERACTION_RUN_INTENT_MISMATCH',
    );
    const aguiRunId = parseInput(
      AguiRunIdSchema,
      input.aguiRunId,
      'INTERACTION_RUN_INTENT_MISMATCH',
    );
    this.assertRunIntentRequest(
      claims,
      copilotThreadId,
      aguiRunId,
      dashboardContext,
      userEvent,
    );

    const organizationId = parseOrganizationName(claims.organization).organization;
    const userId = parseUserName(claims.user).user;
    const claimedVersion = await this.findVersionFromClaim(claims.agentVersion);
    if (!claimedVersion) {
      throw boundary(
        'INTERACTION_RUN_INTENT_STATE_MISMATCH',
        'The approved agent version is no longer active.',
      );
    }
    const parsedVersion = parseAgentVersionName(claims.agentVersion);
    const version = await this.repository.findActiveAgentVersion({
      agentDefinitionKey: parsedVersion.agentDefinitionKey,
      agentVersionId: claimedVersion.id,
    });
    if (!version || !this.isAllowedVersion(version)) {
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

    const sessionName = formatAgentSessionName(
      organizationId,
      AgentSessionIdSchema.parse(authorized.session.id),
    );
    return parseShared(AguiRunAuthorizationSchema, {
      session: sessionName,
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
    const userId = parseInput(
      UserIdSchema,
      input.userId,
      'INTERACTION_CONNECTION_NOT_AUTHORIZED',
    );
    const copilotThreadId = parseInput(
      CopilotThreadIdSchema,
      input.copilotThreadId,
      'INTERACTION_CONNECTION_NOT_AUTHORIZED',
    );
    const session = await this.repository.findAccessibleSession({
      organizationId,
      userId,
      copilotThreadId,
    });
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
    const version = await this.repository.findActiveAgentVersion({
      agentDefinitionKey: 'operator',
      agentVersionId: session.primaryAgentVersionId,
    });
    if (!version || !this.isAllowedVersion(version)) {
      throw boundary(
        'INTERACTION_CONNECTION_NOT_AUTHORIZED',
        'The requested Agent OS session has no active agent version.',
      );
    }

    const sessionName = formatAgentSessionName(
      organizationId,
      AgentSessionIdSchema.parse(session.id),
    );
    const afterSequence = input.cursor
      ? this.verifyReplayCursor(input.cursor, {
        organizationId,
        userId,
        copilotThreadId,
        session,
        sessionName,
      })
      : 0n;
    const page = await this.repository.readConversationEvents({
      organizationId,
      userId,
      sessionId: session.id,
      afterSequence,
      limit: REPLAY_LIMIT,
    });
    const nextCursor = page.hasMore
      ? OpaqueReplayCursorSchema.parse(
        signClaims(
          {
            version: 1 as const,
            organization: formatOrganizationName(organizationId),
            user: formatUserName(userId),
            session: sessionName,
            copilotThreadId,
            afterSequence: NonNegativeDecimalSequenceSchema.parse(
              page.lastSequence.toString(),
            ),
            expiresAtMs: this.now().getTime() + REPLAY_CURSOR_TTL_MS,
          },
          this.replayCursorHmacKey,
          REPLAY_CURSOR_DOMAIN,
        ),
      )
      : null;
    const liveJoinExpiresAt = page.hasMore
      ? null
      : new Date(this.now().getTime() + LIVE_JOIN_TTL_MS);
    const liveJoinToken = liveJoinExpiresAt
      ? OpaqueShortLivedTokenSchema.parse(
        signClaims(
          {
            version: 1 as const,
            organization: formatOrganizationName(organizationId),
            user: formatUserName(userId),
            session: sessionName,
            copilotThreadId,
            contextEpoch: session.contextEpoch,
            afterSequence: NonNegativeDecimalSequenceSchema.parse(
              page.lastSequence.toString(),
            ),
            expiresAtMs: liveJoinExpiresAt.getTime(),
          },
          this.replayCursorHmacKey,
          LIVE_JOIN_DOMAIN,
        ),
      )
      : null;
    const replay = this.toReplay(organizationId, session, page, nextCursor);
    const authorization = parseShared(AguiConnectionAuthorizationSchema, {
      session: sessionName,
      contextEpoch: session.contextEpoch,
      replay: {
        nextCursor,
        lastSequence: NonNegativeDecimalSequenceSchema.parse(
          page.lastSequence.toString(),
        ),
      },
    });

    return {
      authorization,
      replay,
      liveJoinToken,
      liveJoinExpiresAt: liveJoinExpiresAt?.toISOString() ?? null,
    };
  }

  async authorizeCurrentRun(input: AuthorizeCurrentRunInput): Promise<{
    session: string;
    execution: string;
    aguiRunId: string;
  } | null> {
    const organizationId = parseInput(
      OrganizationIdSchema,
      input.organizationId,
      'INTERACTION_CONNECTION_NOT_AUTHORIZED',
    );
    const userId = parseInput(
      UserIdSchema,
      input.userId,
      'INTERACTION_CONNECTION_NOT_AUTHORIZED',
    );
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
    const session = await this.repository.findAccessibleSession({
      organizationId,
      userId,
      copilotThreadId,
    });
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
    const sessionName = formatAgentSessionName(
      organizationId,
      AgentSessionIdSchema.parse(session.id),
    );
    return {
      session: sessionName,
      execution: formatAgentExecutionName(
        organizationId,
        AgentSessionIdSchema.parse(session.id),
        AgentExecutionIdSchema.parse(execution.executionId),
      ),
      aguiRunId: AguiRunIdSchema.parse(execution.aguiRunId),
    };
  }

  async authorizeLiveJoin(input: {
    agentDefinitionKey: string;
    copilotThreadId: string;
    afterSequence: bigint;
    liveJoinToken: string;
  }): Promise<AuthorizedLiveJoin> {
    const claims = verifyClaims(
      input.liveJoinToken,
      this.replayCursorHmacKey,
      LIVE_JOIN_DOMAIN,
      LiveJoinClaimsSchema,
      'INTERACTION_LIVE_JOIN_INVALID',
    );
    if (claims.expiresAtMs <= this.now().getTime()) {
      throw boundary(
        'INTERACTION_LIVE_JOIN_EXPIRED',
        'The live join authorization has expired.',
      );
    }
    const copilotThreadId = parseInput(
      CopilotThreadIdSchema,
      input.copilotThreadId,
      'INTERACTION_LIVE_JOIN_MISMATCH',
    );
    if (
      claims.copilotThreadId !== copilotThreadId ||
      claims.afterSequence !== input.afterSequence.toString()
    ) {
      throw boundary(
        'INTERACTION_LIVE_JOIN_MISMATCH',
        'The live join authorization does not match the requested cursor.',
      );
    }
    const organizationId = parseOrganizationName(claims.organization).organization;
    const userId = parseUserName(claims.user).user;
    const parsedSession = parseAgentSessionName(claims.session, claims.organization);
    const session = await this.repository.findAccessibleSession({
      organizationId,
      userId,
      copilotThreadId,
    });
    if (
      !session ||
      session.id !== parsedSession.session ||
      session.lifecycle !== 'active' ||
      session.contextEpoch !== claims.contextEpoch
    ) {
      throw boundary(
        'INTERACTION_LIVE_JOIN_MISMATCH',
        'The live join session is no longer current.',
      );
    }
    const definition = parseInput(
      AgentDefinitionKeySchema,
      input.agentDefinitionKey,
      'INTERACTION_LIVE_JOIN_MISMATCH',
    );
    const version = await this.repository.findActiveAgentVersion({
      agentDefinitionKey: definition,
      agentVersionId: session.primaryAgentVersionId,
    });
    if (!version || !this.isAllowedVersion(version)) {
      throw boundary(
        'INTERACTION_LIVE_JOIN_MISMATCH',
        'The live join agent version is not active.',
      );
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
    await this.allowedVersions();
    await this.repository.probeHealth();
    return { status: 'ok' };
  }

  private allowedAgent(version: ActiveAgentVersionRecord) {
    const definition = AgentDefinitionKeySchema.parse(version.agentDefinitionKey);
    return parseShared(AllowedAgentSchema, {
      agentDefinitionKey: definition,
      agentVersion: formatAgentVersionName(
        definition,
        AgentVersionKeySchema.parse(String(version.version)),
      ),
      displayName: version.displayName,
      description: version.description,
      isDefault: version.agentDefinitionKey === 'operator',
    });
  }

  private createRunIntentClaims(input: {
    organizationId: z.infer<typeof OrganizationIdSchema>;
    userId: z.infer<typeof UserIdSchema>;
    copilotThreadId: z.infer<typeof CopilotThreadIdSchema>;
    aguiRunId: z.infer<typeof AguiRunIdSchema>;
    version: ActiveAgentVersionRecord;
    dashboardContext: DashboardContext;
    userEvent: z.infer<typeof UserEventSchema>;
    expiresAtMs: number;
  }): RunIntentClaims {
    const definition = AgentDefinitionKeySchema.parse(input.version.agentDefinitionKey);
    return verifyLocalClaims(RunIntentClaimsSchema, {
      version: 1,
      organization: formatOrganizationName(input.organizationId),
      user: formatUserName(input.userId),
      agentVersion: formatAgentVersionName(
        definition,
        AgentVersionKeySchema.parse(String(input.version.version)),
      ),
      copilotThreadId: input.copilotThreadId,
      aguiRunId: input.aguiRunId,
      dashboardContextHash: Sha256DigestSchema.parse(hashCanonical(input.dashboardContext)),
      policyHash: Sha256DigestSchema.parse(foundationPolicyHash(input.version)),
      inputHash: Sha256DigestSchema.parse(
        hashCanonical({ dashboardContext: input.dashboardContext, userEvent: input.userEvent }),
      ),
      expiresAtMs: input.expiresAtMs,
    });
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
      claims.dashboardContextHash !== hashCanonical(dashboardContext) ||
      claims.inputHash !== hashCanonical({ dashboardContext, userEvent })
    ) {
      throw boundary(
        'INTERACTION_RUN_INTENT_MISMATCH',
        'The request does not match its signed run intent.',
      );
    }
  }

  private async findVersionFromClaim(
    agentVersionName: z.infer<typeof AgentVersionNameSchema>,
  ): Promise<ActiveAgentVersionRecord | null> {
    const parsed = parseAgentVersionName(agentVersionName);
    const match = (await this.allowedVersions()).find(
      (version) =>
        version.agentDefinitionKey === parsed.agentDefinitionKey &&
        String(version.version) === parsed.version,
    );
    return match ?? null;
  }

  private assertCurrentVersion(
    claims: RunIntentClaims,
    current: ActiveAgentVersionRecord,
  ): void {
    const expectedVersion = formatAgentVersionName(
      AgentDefinitionKeySchema.parse(current.agentDefinitionKey),
      AgentVersionKeySchema.parse(String(current.version)),
    );
    if (
      claims.agentVersion !== expectedVersion ||
      claims.policyHash !== foundationPolicyHash(current)
    ) {
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
    const claims = verifyClaims(
      cursor,
      this.replayCursorHmacKey,
      REPLAY_CURSOR_DOMAIN,
      ReplayCursorClaimsSchema,
      'INTERACTION_REPLAY_CURSOR_INVALID',
    );
    if (claims.expiresAtMs <= this.now().getTime()) {
      throw boundary(
        'INTERACTION_REPLAY_CURSOR_EXPIRED',
        'The replay cursor has expired.',
      );
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
      throw boundary(
        'INTERACTION_REPLAY_CURSOR_INVALID',
        'The replay cursor is invalid.',
      );
    }
  }

  private toReplay(
    organizationId: z.infer<typeof OrganizationIdSchema>,
    session: AgentSessionRecord,
    page: ConversationEventPage,
    nextCursor: z.infer<typeof OpaqueReplayCursorSchema> | null,
  ): AgentConversationReplay {
    const sessionId = AgentSessionIdSchema.parse(session.id);
    const sessionName = formatAgentSessionName(organizationId, sessionId);
    return parseShared(AgentConversationReplaySchema, {
      session: sessionName,
      events: page.events.map((event) => this.toEnvelope(organizationId, sessionId, event)),
      nextCursor,
      lastSequence: NonNegativeDecimalSequenceSchema.parse(page.lastSequence.toString()),
    });
  }

  private toEnvelope(
    organizationId: z.infer<typeof OrganizationIdSchema>,
    sessionId: z.infer<typeof AgentSessionIdSchema>,
    event: AgentConversationEventRecord,
  ) {
    return parseShared(AgentConversationEventEnvelopeSchema, {
      name: formatAgentConversationEventName(
        organizationId,
        sessionId,
        PositiveDecimalSequenceSchema.parse(event.sequence.toString()),
      ),
      session: formatAgentSessionName(organizationId, sessionId),
      execution: event.executionId === null
        ? null
        : formatAgentExecutionName(
          organizationId,
          sessionId,
          AgentExecutionIdSchema.parse(event.executionId),
        ),
      aguiRunId: event.aguiRunId,
      sequence: PositiveDecimalSequenceSchema.parse(event.sequence.toString()),
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    });
  }

  private async requireAllowedVersion(
    agentDefinitionKey: z.infer<typeof AgentDefinitionKeySchema>,
  ): Promise<ActiveAgentVersionRecord> {
    const match = (await this.allowedVersions()).find(
      (version) => version.agentDefinitionKey === agentDefinitionKey,
    );
    if (!match) {
      throw boundary(
        'AGENT_NOT_ALLOWED',
        'The requested interaction agent is not server-approved.',
      );
    }
    return match;
  }

  private async allowedVersions(): Promise<ActiveAgentVersionRecord[]> {
    const activeDefinitions = new Set(
      listAgentDefinitions()
        .filter((definition) => definition.catalogStatus === 'active')
        .map((definition) => definition.type),
    );
    const matched = (await this.repository.listActiveAgentVersions()).filter(
      (version) =>
        this.isAllowedVersion(version) &&
        activeDefinitions.has(definitionType(version.agentDefinitionKey)),
    );
    const seenDefinitions = new Set<string>();
    for (const version of matched) {
      const mappedDefinition = definitionType(version.agentDefinitionKey);
      if (
        seenDefinitions.has(mappedDefinition) ||
        seenDefinitions.has(version.agentDefinitionKey)
      ) {
        throw boundary(
          'AGENT_VERSION_AMBIGUOUS',
          'Multiple active versions map to the same interaction agent.',
        );
      }
      seenDefinitions.add(mappedDefinition);
      seenDefinitions.add(version.agentDefinitionKey);
      if (!version.modelIdentity.trim()) {
        throw boundary(
          'AGENT_MODEL_NOT_CONFIGURED',
          'An active AgentVersion has no explicit model identity.',
        );
      }
      if (!version.runtimeType.trim()) {
        throw boundary(
          'AGENT_RUNTIME_NOT_CONFIGURED',
          'An active AgentVersion has no explicit runtime type.',
        );
      }
      if (
        version.agentDefinitionKey === 'operator' &&
        !hasExactFoundationCapabilities(version.capabilityKeys)
      ) {
        throw boundary(
          'AGENT_POLICY_NOT_CONFIGURED',
          'The active Operator AgentVersion does not declare the immutable foundation capability profile.',
        );
      }
    }
    if (
      matched.filter((version) => version.agentDefinitionKey === 'operator').length !== 1
    ) {
      throw boundary(
        'AGENT_OPERATOR_NOT_CONFIGURED',
        'Exactly one active Operator AgentVersion is required.',
      );
    }
    return matched.sort(
      (left, right) =>
        Number(right.agentDefinitionKey === 'operator') -
          Number(left.agentDefinitionKey === 'operator') ||
        left.agentDefinitionKey.localeCompare(right.agentDefinitionKey),
    );
  }

  private isAllowedVersion(version: ActiveAgentVersionRecord): boolean {
    return Boolean(version.activatedAt) && version.retiredAt === null;
  }
}

function definitionType(agentDefinitionKey: string): string {
  return agentDefinitionKey === 'operator' ? 'manager' : agentDefinitionKey;
}

function foundationPolicyHash(version: ActiveAgentVersionRecord): string {
  return hashCanonical({
    authorityProfileVersionId: AUTHORITY_PROFILE_VERSION_ID,
    capabilityKeys: FOUNDATION_CAPABILITY_KEYS,
    agentDefinitionKey: version.agentDefinitionKey,
    agentVersion: version.version,
    runtimeType: version.runtimeType,
    modelIdentity: version.modelIdentity,
    policyDocument: version.policyDocument,
    versionCapabilityKeys: version.capabilityKeys,
  });
}

function foundationAuthorityProfilePolicyDocument(): Record<string, unknown> {
  return {
    authorityClass: AUTHORITY_PROFILE_VERSION_ID,
    capabilityKeys: FOUNDATION_CAPABILITY_KEYS,
  };
}

function foundationAuthorityProfilePolicyHash(): string {
  return hashCanonical(foundationAuthorityProfilePolicyDocument());
}

function hasExactFoundationCapabilities(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === FOUNDATION_CAPABILITY_KEYS.length &&
    value.every((key, index) => key === FOUNDATION_CAPABILITY_KEYS[index])
  );
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  const encoded = JSON.stringify(sortCanonical(value));
  if (encoded === undefined) {
    throw boundary(
      'INTERACTION_CANONICALIZATION_INVALID',
      'The interaction payload cannot be canonicalized.',
    );
  }
  return encoded;
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortCanonical(nested)]),
    );
  }
  return value;
}

function signClaims(claims: object, key: Buffer, domain: string): string {
  const encoded = Buffer.from(canonicalJson(claims)).toString('base64url');
  const signature = createHmac('sha256', key)
    .update(domain)
    .update('\0')
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyClaims<T extends z.ZodTypeAny>(
  token: string,
  key: Buffer,
  domain: string,
  schema: T,
  errorCode: string,
): z.infer<T> {
  try {
    const parts = token.split('.');
    if (
      parts.length !== 2 ||
      !parts[0] ||
      !parts[1] ||
      !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
      !/^[A-Za-z0-9_-]+$/.test(parts[1])
    ) {
      throw new Error('invalid token shape');
    }
    const actual = Buffer.from(parts[1], 'base64url');
    const expected = createHmac('sha256', key)
      .update(domain)
      .update('\0')
      .update(parts[0])
      .digest();
    if (
      actual.byteLength !== expected.byteLength ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new Error('invalid token signature');
    }
    return schema.parse(
      JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
    );
  } catch (error) {
    if (error instanceof AgentOsBoundaryError) throw error;
    throw boundary(errorCode, 'The signed interaction token is invalid.');
  }
}

function verifyLocalClaims<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.infer<T> {
  try {
    return schema.parse(value);
  } catch {
    throw boundary(
      'INTERACTION_INTERNAL_CLAIMS_INVALID',
      'The interaction claims could not be constructed.',
    );
  }
}

function parseInput<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  code: string,
): z.infer<T> {
  try {
    return schema.parse(value);
  } catch {
    throw boundary(code, 'The interaction request payload is invalid.');
  }
}

function parseShared<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.infer<T> {
  try {
    return schema.parse(value);
  } catch {
    throw boundary(
      'INTERACTION_RESPONSE_INVALID',
      'The interaction response violates its boundary contract.',
    );
  }
}

function boundary(code: string, message: string): AgentOsBoundaryError {
  return new AgentOsBoundaryError(code, message);
}
