import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AguiConnectionAuthorizationSchema,
  AguiRunAuthorizationSchema,
  AguiRunIntentSchema,
  AgentConversationEventEnvelopeSchema,
  AgentSessionSummarySchema,
  AllowedAgentSchema,
  DashboardContextSchema,
  InteractionBootstrapSchema,
  InteractionPrincipalSchema,
  MessageEventPayloadSchema,
  type AguiConnectionAuthorization,
  type AguiRunAuthorization,
  type AguiRunIntent,
  type AgentSessionSummary,
  type DashboardContext,
  type InteractionBootstrap,
  type InteractionPrincipal,
} from '@kiditem/shared/agent-interaction';
import {
  AGENT_INTERACTION_REPOSITORY,
  type ActiveAgentVersionRecord,
  type AgentInteractionRepositoryPort,
  type AgentSessionRecord,
} from '../port/out/repository/agent-interaction-repository.port';
import { AgentOsBoundaryError } from '../../domain/agent-os.errors';
import { listAgentDefinitions } from '../../domain/agent-definition.registry';
import {
  INTERACTION_CLOCK,
  INTERACTION_PRINCIPAL_HMAC_KEY,
  INTERACTION_REPLAY_CURSOR_HMAC_KEY,
  INTERACTION_RUN_INTENT_HMAC_KEY,
  type InteractionClock,
} from './agent-interaction.tokens';

const RUN_INTENT_TTL_MS = 30_000;
const LIVE_JOIN_TTL_MS = 15_000;
const REPLAY_CURSOR_TTL_MS = 15 * 60_000;
const REPLAY_LIMIT = 500;
const AUTHORITY_PROFILE_VERSION_ID = 'foundation_read_only_probe:v1';
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
    payload: MessageEventPayloadSchema,
  })
  .strict();

const RunIntentClaimsSchema = z
  .object({
    version: z.literal(1),
    organizationId: z.string().min(1),
    userId: z.string().min(1),
    agentDefinitionKey: z.string().min(1),
    agentVersionId: z.string().min(1),
    agentVersion: z.number().int().positive(),
    runtimeType: z.string().min(1),
    modelIdentity: z.string().min(1),
    authorityProfileVersionId: z.literal(AUTHORITY_PROFILE_VERSION_ID),
    capabilityKeys: z.tuple([
      z.literal(FOUNDATION_CAPABILITY_KEYS[0]),
      z.literal(FOUNDATION_CAPABILITY_KEYS[1]),
      z.literal(FOUNDATION_CAPABILITY_KEYS[2]),
      z.literal(FOUNDATION_CAPABILITY_KEYS[3]),
    ]),
    policyDocumentHash: z.string().regex(/^[a-f0-9]{64}$/),
    policyHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    dashboardContextHash: z.string().regex(/^[a-f0-9]{64}$/),
    userEventHash: z.string().regex(/^[a-f0-9]{64}$/),
    copilotThreadId: z.string().min(1),
    aguiRunId: z.string().min(1),
    expiresAtMs: z.number().int().positive(),
  })
  .strict();

const ReplayCursorClaimsSchema = z
  .object({
    version: z.literal(1),
    organizationId: z.string().min(1),
    userId: z.string().min(1),
    sessionId: z.string().min(1),
    copilotThreadId: z.string().min(1),
    afterSequence: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
    expiresAtMs: z.number().int().positive(),
  })
  .strict();

const LiveJoinClaimsSchema = z
  .object({
    version: z.literal(1),
    organizationId: z.string().min(1),
    userId: z.string().min(1),
    sessionId: z.string().min(1),
    copilotThreadId: z.string().min(1),
    contextEpoch: z.number().int().positive(),
    afterSequence: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
    expiresAtMs: z.number().int().positive(),
  })
  .strict();

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

export interface AuthorizedLiveJoin {
  organizationId: string;
  userId: string;
  sessionId: string;
  copilotThreadId: string;
  contextEpoch: number;
  afterSequence: bigint;
}

@Injectable()
export class AgentInteractionIdentityService {
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
    const digest = createHmac('sha256', this.principalHmacKey)
      .update('kiditem.agent-os.principal.v1\0')
      .update(canonicalJson([input.organizationId, input.userId]))
      .digest('base64url');
    return parseShared(InteractionPrincipalSchema, {
      principalKey: `ei_${digest}`,
      organizationId: input.organizationId,
      userId: input.userId,
    });
  }

  async bootstrap(input: IdentityInput): Promise<InteractionBootstrap> {
    const versions = await this.allowedVersions();
    const sessions = await this.repository.listSessions({ ...input, limit: 50 });
    return parseShared(InteractionBootstrapSchema, {
      defaultAgentDefinitionKey: 'operator',
      agents: versions.map((version) =>
        parseShared(AllowedAgentSchema, {
          agentDefinitionKey: version.agentDefinitionKey,
          agentVersionId: version.id,
          displayName: version.displayName,
          description: version.description,
          isDefault: version.agentDefinitionKey === 'operator',
        }),
      ),
      sessions,
    });
  }

  async prepareRunIntent(input: PrepareRunIntentInput): Promise<AguiRunIntent> {
    const version = await this.requireAllowedVersion(input.agentDefinitionKey);
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
    const claims = this.createRunIntentClaims(
      input,
      version,
      dashboardContext,
      userEvent,
      expiresAt.getTime(),
    );
    return parseShared(AguiRunIntentSchema, {
      runIntent: signClaims(
        claims,
        this.runIntentHmacKey,
        RUN_INTENT_DOMAIN,
      ),
      expiresAt: expiresAt.toISOString(),
      copilotThreadId: input.copilotThreadId,
      aguiRunId: input.aguiRunId,
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
    this.assertRunIntentRequest(claims, input, dashboardContext, userEvent);

    const current = await this.repository.findActiveAgentVersion({
      agentDefinitionKey: claims.agentDefinitionKey,
      agentVersionId: claims.agentVersionId,
    });
    if (!current || !this.isAllowedVersion(current)) {
      throw boundary(
        'INTERACTION_RUN_INTENT_STATE_MISMATCH',
        'The approved agent version is no longer active.',
      );
    }
    this.assertCurrentVersion(claims, current);

    const authorized = await this.repository.authorizeExecution({
      organizationId: claims.organizationId,
      userId: claims.userId,
      copilotThreadId: input.copilotThreadId,
      aguiRunId: input.aguiRunId,
      agentVersionId: current.id,
      runtimeType: current.runtimeType,
      modelIdentity: current.modelIdentity,
      authorityProfileVersionId: AUTHORITY_PROFILE_VERSION_ID,
      capabilityKeys: [...FOUNDATION_CAPABILITY_KEYS],
      policyHash: claims.policyHash,
      inputHash: claims.inputHash,
      userEvent,
    });
    this.assertAuthorizedRecord(authorized, claims, input);

    return parseShared(AguiRunAuthorizationSchema, {
      session: sessionSummary(authorized.session, claims.agentDefinitionKey),
      sessionTaskId: authorized.rootTask.id,
      executionId: authorized.execution.id,
      modelIdentity: authorized.execution.modelIdentity,
      runtimeType: authorized.execution.runtimeType,
      policySnapshotId: authorized.policy.id,
      contextEpoch: authorized.contextEpoch,
      dashboardContext,
    });
  }

  async authorizeConnection(
    input: AuthorizeConnectionInput,
  ): Promise<AguiConnectionAuthorization> {
    const session = await this.repository.findAccessibleSession({
      organizationId: input.organizationId,
      userId: input.userId,
      copilotThreadId: input.copilotThreadId,
    });
    if (
      !session ||
      session.lifecycle !== 'active' ||
      session.organizationId !== input.organizationId ||
      session.createdByUserId !== input.userId ||
      session.copilotThreadId !== input.copilotThreadId
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
    const afterSequence = input.cursor
      ? this.verifyReplayCursor(input.cursor, input, session)
      : 0n;
    const page = await this.repository.readConversationEvents({
      organizationId: input.organizationId,
      userId: input.userId,
      sessionId: session.id,
      afterSequence,
      limit: REPLAY_LIMIT,
    });
    const nextCursor = page.hasMore
      ? signClaims(
          {
            version: 1 as const,
            organizationId: input.organizationId,
            userId: input.userId,
            sessionId: session.id,
            copilotThreadId: input.copilotThreadId,
            afterSequence: page.lastSequence.toString(),
            expiresAtMs: this.now().getTime() + REPLAY_CURSOR_TTL_MS,
          },
          this.replayCursorHmacKey,
          REPLAY_CURSOR_DOMAIN,
        )
      : null;
    const liveJoinExpiresAt = page.hasMore
      ? null
      : new Date(this.now().getTime() + LIVE_JOIN_TTL_MS);
    const liveJoinClaims = liveJoinExpiresAt
      ? verifyLocalClaims(LiveJoinClaimsSchema, {
          version: 1,
          organizationId: input.organizationId,
          userId: input.userId,
          sessionId: session.id,
          copilotThreadId: input.copilotThreadId,
          contextEpoch: session.contextEpoch,
          afterSequence: page.lastSequence.toString(),
          expiresAtMs: liveJoinExpiresAt.getTime(),
        })
      : null;
    const liveJoinToken = liveJoinClaims
      ? signClaims(
          liveJoinClaims,
          this.replayCursorHmacKey,
          LIVE_JOIN_DOMAIN,
        )
      : null;

    return parseShared(AguiConnectionAuthorizationSchema, {
      session: sessionSummary(session, version.agentDefinitionKey),
      contextEpoch: session.contextEpoch,
      replay: {
        sessionId: session.id,
        events: page.events.map((event) =>
          parseShared(AgentConversationEventEnvelopeSchema, {
            eventId: event.id,
            sessionId: event.sessionId,
            executionId: event.executionId,
            sequence: event.sequence.toString(),
            eventType: event.eventType,
            schemaVersion: event.schemaVersion,
            payload: event.payload,
            createdAt: event.createdAt.toISOString(),
          }),
        ),
        nextCursor,
        lastSequence: page.lastSequence.toString(),
      },
      liveJoinToken,
      liveJoinExpiresAt: liveJoinExpiresAt?.toISOString() ?? null,
    });
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
    if (
      claims.copilotThreadId !== input.copilotThreadId ||
      claims.afterSequence !== input.afterSequence.toString()
    ) {
      throw boundary(
        'INTERACTION_LIVE_JOIN_MISMATCH',
        'The live join authorization does not match the requested cursor.',
      );
    }
    const session = await this.repository.findAccessibleSession({
      organizationId: claims.organizationId,
      userId: claims.userId,
      copilotThreadId: claims.copilotThreadId,
    });
    if (
      !session ||
      session.id !== claims.sessionId ||
      session.lifecycle !== 'active' ||
      session.contextEpoch !== claims.contextEpoch
    ) {
      throw boundary(
        'INTERACTION_LIVE_JOIN_MISMATCH',
        'The live join session is no longer current.',
      );
    }
    const version = await this.repository.findActiveAgentVersion({
      agentDefinitionKey: input.agentDefinitionKey,
      agentVersionId: session.primaryAgentVersionId,
    });
    if (!version || !this.isAllowedVersion(version)) {
      throw boundary(
        'INTERACTION_LIVE_JOIN_MISMATCH',
        'The live join agent version is not active.',
      );
    }
    return {
      organizationId: claims.organizationId,
      userId: claims.userId,
      sessionId: claims.sessionId,
      copilotThreadId: claims.copilotThreadId,
      contextEpoch: claims.contextEpoch,
      afterSequence: input.afterSequence,
    };
  }

  async health(): Promise<{ status: 'ok' }> {
    await this.allowedVersions();
    await this.repository.probeHealth();
    return { status: 'ok' };
  }

  private createRunIntentClaims(
    input: PrepareRunIntentInput,
    version: ActiveAgentVersionRecord,
    dashboardContext: DashboardContext,
    userEvent: z.infer<typeof UserEventSchema>,
    expiresAtMs: number,
  ): RunIntentClaims {
    const dashboardContextHash = hashCanonical(dashboardContext);
    const userEventHash = hashCanonical(userEvent);
    return verifyLocalClaims(RunIntentClaimsSchema, {
      version: 1,
      organizationId: input.organizationId,
      userId: input.userId,
      agentDefinitionKey: version.agentDefinitionKey,
      agentVersionId: version.id,
      agentVersion: version.version,
      runtimeType: version.runtimeType,
      modelIdentity: version.modelIdentity,
      authorityProfileVersionId: AUTHORITY_PROFILE_VERSION_ID,
      capabilityKeys: [...FOUNDATION_CAPABILITY_KEYS],
      policyDocumentHash: hashCanonical(version.policyDocument),
      policyHash: foundationPolicyHash(version),
      inputHash: hashCanonical({ dashboardContext, userEvent }),
      dashboardContextHash,
      userEventHash,
      copilotThreadId: input.copilotThreadId,
      aguiRunId: input.aguiRunId,
      expiresAtMs,
    });
  }

  private assertRunIntentRequest(
    claims: RunIntentClaims,
    input: AuthorizeRunInput,
    dashboardContext: DashboardContext,
    userEvent: z.infer<typeof UserEventSchema>,
  ): void {
    if (
      claims.copilotThreadId !== input.copilotThreadId ||
      claims.aguiRunId !== input.aguiRunId ||
      claims.dashboardContextHash !== hashCanonical(dashboardContext) ||
      claims.userEventHash !== hashCanonical(userEvent) ||
      claims.inputHash !== hashCanonical({ dashboardContext, userEvent })
    ) {
      throw boundary(
        'INTERACTION_RUN_INTENT_MISMATCH',
        'The request does not match its signed run intent.',
      );
    }
  }

  private assertCurrentVersion(
    claims: RunIntentClaims,
    current: ActiveAgentVersionRecord,
  ): void {
    if (
      claims.agentVersionId !== current.id ||
      claims.agentDefinitionKey !== current.agentDefinitionKey ||
      claims.agentVersion !== current.version ||
      claims.runtimeType !== current.runtimeType ||
      claims.modelIdentity !== current.modelIdentity ||
      claims.policyDocumentHash !== hashCanonical(current.policyDocument) ||
      claims.policyHash !== foundationPolicyHash(current)
    ) {
      throw boundary(
        'INTERACTION_RUN_INTENT_STATE_MISMATCH',
        'The agent version or policy changed after intent preparation.',
      );
    }
  }

  private assertAuthorizedRecord(
    record: Awaited<ReturnType<AgentInteractionRepositoryPort['authorizeExecution']>>,
    claims: RunIntentClaims,
    input: AuthorizeRunInput,
  ): void {
    if (
      record.session.organizationId !== claims.organizationId ||
      record.session.createdByUserId !== claims.userId ||
      record.session.copilotThreadId !== input.copilotThreadId ||
      record.session.primaryAgentVersionId !== claims.agentVersionId ||
      record.session.authorityProfileVersionId !== AUTHORITY_PROFILE_VERSION_ID ||
      record.rootTask.sessionId !== record.session.id ||
      record.execution.sessionId !== record.session.id ||
      record.execution.sessionTaskId !== record.rootTask.id ||
      record.execution.copilotThreadId !== input.copilotThreadId ||
      record.execution.aguiRunId !== input.aguiRunId ||
      record.execution.agentVersionId !== claims.agentVersionId ||
      record.execution.runtimeType !== claims.runtimeType ||
      record.execution.modelIdentity !== claims.modelIdentity ||
      record.execution.policySnapshotId !== record.policy.id ||
      record.policy.sessionId !== record.session.id ||
      record.policy.agentVersionId !== claims.agentVersionId ||
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
    input: AuthorizeConnectionInput,
    session: AgentSessionRecord,
  ): bigint {
    const claims = verifyClaims(
      cursor,
      this.replayCursorHmacKey,
      REPLAY_CURSOR_DOMAIN,
      ReplayCursorClaimsSchema,
      'INTERACTION_REPLAY_CURSOR_INVALID',
    );
    if (
      claims.organizationId !== input.organizationId ||
      claims.userId !== input.userId ||
      claims.sessionId !== session.id ||
      claims.copilotThreadId !== input.copilotThreadId
    ) {
      throw boundary(
        'INTERACTION_REPLAY_CURSOR_MISMATCH',
        'The replay cursor does not belong to the requested session.',
      );
    }
    if (claims.expiresAtMs <= this.now().getTime()) {
      throw boundary(
        'INTERACTION_REPLAY_CURSOR_EXPIRED',
        'The replay cursor has expired.',
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

  private async requireAllowedVersion(
    agentDefinitionKey: string,
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
    if (
      match.agentDefinitionKey === 'operator' &&
      !hasExactFoundationCapabilities(match.capabilityKeys)
    ) {
      throw boundary(
        'AGENT_POLICY_NOT_CONFIGURED',
        'The active Operator AgentVersion does not declare the immutable foundation capability profile.',
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
      matched.filter((version) => version.agentDefinitionKey === 'operator')
        .length !== 1
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

function sessionSummary(
  session: AgentSessionRecord,
  primaryAgentDefinitionKey: string,
): AgentSessionSummary {
  return parseShared(AgentSessionSummarySchema, {
    sessionId: session.id,
    copilotThreadId: session.copilotThreadId,
    primaryAgentDefinitionKey,
    primaryAgentVersionId: session.primaryAgentVersionId,
    lifecycle: session.lifecycle,
    updatedAt: session.updatedAt.toISOString(),
  });
}

function foundationPolicyHash(version: ActiveAgentVersionRecord): string {
  return hashCanonical({
    authorityProfileVersionId: AUTHORITY_PROFILE_VERSION_ID,
    capabilityKeys: FOUNDATION_CAPABILITY_KEYS,
    agentDefinitionKey: version.agentDefinitionKey,
    agentVersionId: version.id,
    agentVersion: version.version,
    runtimeType: version.runtimeType,
    modelIdentity: version.modelIdentity,
    policyDocument: version.policyDocument,
    versionCapabilityKeys: version.capabilityKeys,
  });
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

function signClaims(
  claims: object,
  key: Buffer,
  domain: string,
): string {
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
