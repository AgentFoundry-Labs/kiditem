import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AllowedAgentSchema,
  DashboardContextSchema,
  InteractionBootstrapSchema,
  AguiRunIntentSchema,
  type AguiRunIntent,
  type DashboardContext,
  type InteractionBootstrap,
} from '@kiditem/shared/agent-interaction';
import {
  AgentDefinitionKeySchema,
  AgentVersionKeySchema,
  AgentVersionNameSchema,
  AguiRunIdSchema,
  CopilotThreadIdSchema,
  OrganizationIdSchema,
  OpaqueShortLivedTokenSchema,
  Sha256DigestSchema,
  UserIdSchema,
  formatAgentVersionName,
  formatOrganizationName,
  formatUserName,
} from '@kiditem/shared/identifiers';
import {
  AGENT_INTERACTION_REPOSITORY,
  type ActiveAgentVersionRecord,
  type AgentInteractionRepositoryPort,
} from '../../port/out/repository/agent-interaction-repository.port';
import type {
  AgentInteractionBootstrapPort,
  InteractionPrincipal,
  InteractionPrincipalInput,
  PrepareRunIntentInput,
} from '../../port/in/interaction/agent-interaction-bootstrap.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import {
  INTERACTION_CLOCK,
  INTERACTION_PRINCIPAL_HMAC_KEY,
  INTERACTION_RUN_INTENT_HMAC_KEY,
  type InteractionClock,
} from '../agent-interaction.tokens';
import {
  InteractionTokenCodec,
  RUN_INTENT_DOMAIN,
  RUN_INTENT_TTL_MS,
  RunIntentClaimsSchema,
  UserEventSchema,
  type RunIntentClaims,
} from './interaction-token-codec';
import { InteractionAllowedVersionResolver } from './interaction-allowed-version-resolver';
import { foundationPolicyHash } from './interaction-authority-profile';

@Injectable()
export class AgentInteractionBootstrapService implements AgentInteractionBootstrapPort {
  constructor(
    @Inject(AGENT_INTERACTION_REPOSITORY)
    private readonly repository: AgentInteractionRepositoryPort,
    @Inject(INTERACTION_CLOCK) private readonly now: InteractionClock,
    @Inject(INTERACTION_PRINCIPAL_HMAC_KEY)
    private readonly principalHmacKey: Buffer,
    @Inject(INTERACTION_RUN_INTENT_HMAC_KEY)
    private readonly runIntentHmacKey: Buffer,
    private readonly versions: InteractionAllowedVersionResolver,
  ) {}

  resolvePrincipal(input: InteractionPrincipalInput): InteractionPrincipal {
    const organizationId = parseInput(
      OrganizationIdSchema,
      input.organizationId,
      'INTERACTION_PRINCIPAL_INVALID',
    );
    const userId = parseInput(UserIdSchema, input.userId, 'INTERACTION_PRINCIPAL_INVALID');
    const digest = createHmac('sha256', this.principalHmacKey)
      .update('kiditem.agent-os.principal.v1\0')
      .update(InteractionTokenCodec.canonicalJson([organizationId, userId]))
      .digest('base64url');
    return { principalKey: `ei_${digest}` };
  }

  async bootstrap(input: InteractionPrincipalInput): Promise<InteractionBootstrap> {
    const versions = await this.resolveAllowedVersions();
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
    const userId = parseInput(UserIdSchema, input.userId, 'INTERACTION_PRINCIPAL_INVALID');
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
        InteractionTokenCodec.sign(claims, this.runIntentHmacKey, RUN_INTENT_DOMAIN),
      ),
      expiresAt: expiresAt.toISOString(),
      copilotThreadId,
      aguiRunId,
    });
  }

  async resolveAllowedVersionFromName(
    agentVersionName: z.infer<typeof AgentVersionNameSchema>,
  ): Promise<ActiveAgentVersionRecord | null> {
    return this.versions.resolveFromName(agentVersionName);
  }

  async resolveAllowedVersionById(
    agentDefinitionKey: string,
    agentVersionId: string,
  ): Promise<ActiveAgentVersionRecord | null> {
    return this.versions.resolveById(agentDefinitionKey, agentVersionId);
  }

  async resolveAllowedVersions(): Promise<ActiveAgentVersionRecord[]> {
    return this.versions.resolveAll();
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
    return local(RunIntentClaimsSchema, {
      version: 1,
      organization: formatOrganizationName(input.organizationId),
      user: formatUserName(input.userId),
      agentVersion: formatAgentVersionName(definition, AgentVersionKeySchema.parse(String(input.version.version))),
      copilotThreadId: input.copilotThreadId,
      aguiRunId: input.aguiRunId,
      dashboardContextHash: Sha256DigestSchema.parse(InteractionTokenCodec.hash(input.dashboardContext)),
      policyHash: Sha256DigestSchema.parse(foundationPolicyHash(input.version)),
      inputHash: Sha256DigestSchema.parse(InteractionTokenCodec.hash({
        dashboardContext: input.dashboardContext,
        userEvent: input.userEvent,
      })),
      expiresAtMs: input.expiresAtMs,
    });
  }

  private async requireAllowedVersion(
    agentDefinitionKey: z.infer<typeof AgentDefinitionKeySchema>,
  ): Promise<ActiveAgentVersionRecord> {
    const match = (await this.resolveAllowedVersions()).find(
      (version) => version.agentDefinitionKey === agentDefinitionKey,
    );
    if (!match) {
      throw boundary('AGENT_NOT_ALLOWED', 'The requested interaction agent is not server-approved.');
    }
    return match;
  }
}

function parseInput<T extends z.ZodTypeAny>(schema: T, value: unknown, code: string): z.infer<T> {
  return InteractionTokenCodec.parse(schema, value, code);
}

function local<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return InteractionTokenCodec.local(schema, value);
}

function parseShared<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return InteractionTokenCodec.response(schema, value);
}

function boundary(code: string, message: string): AgentOsBoundaryError {
  return new AgentOsBoundaryError(code, message);
}
