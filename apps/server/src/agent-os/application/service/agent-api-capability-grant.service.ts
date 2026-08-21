import {
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import {
  AGENT_API_CAPABILITIES,
  AGENT_API_CAPABILITY,
  AGENT_API_COLLECTION_CAPABILITY,
  AGENT_API_SHADOW_COLLECTION_CAPABILITY,
  type AgentApiCapability,
  type AgentApiCapabilityPrincipal,
} from '../port/in/capability/agent-api-capability-grant.port';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';

export const AGENT_API_CAPABILITY_GRANT_TTL_MS = 120_000;
export {
  AGENT_API_CAPABILITIES,
  AGENT_API_CAPABILITY,
  AGENT_API_COLLECTION_CAPABILITY,
  AGENT_API_SHADOW_COLLECTION_CAPABILITY,
  type AgentApiCapability,
  type AgentApiCapabilityPrincipal,
} from '../port/in/capability/agent-api-capability-grant.port';

const MAX_TOKEN_LENGTH = 4_096;
const MAX_PAYLOAD_LENGTH = 2_048;
const INVALID_GRANT = 'agent_api_capability_grant_invalid';
const UNAUTHORIZED_GRANT = 'agent_api_capability_grant_unauthorized';

const AgentApiCapabilitySchema = z.enum(AGENT_API_CAPABILITIES);
const AgentApiCapabilityListSchema = z
  .array(AgentApiCapabilitySchema)
  .min(1)
  .max(AGENT_API_CAPABILITIES.length)
  .superRefine((capabilities, context) => {
    const normalized = normalizeCapabilities(capabilities);
    if (
      normalized.length !== capabilities.length
      || normalized.some((capability, index) => capabilities[index] !== capability)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'agent_api_capability_grant_capabilities_invalid',
      });
    }
  });

const AgentApiCapabilityGrantClaimsSchema = z
  .object({
    version: z.literal(1),
    audience: z.literal('kiditem-api-operation-command'),
    organizationId: z.string().uuid(),
    requestId: z.string().uuid(),
    runId: z.string().uuid(),
    agentInstanceId: z.string().uuid(),
    capabilities: AgentApiCapabilityListSchema,
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    nonce: z.string().uuid(),
  })
  .strict();

export type AgentApiCapabilityGrantClaims = z.infer<
  typeof AgentApiCapabilityGrantClaimsSchema
>;

@Injectable()
export class AgentApiCapabilityGrantService {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Optional()
    private readonly configuredSecret: string | undefined =
      process.env.AGENT_API_CAPABILITY_GRANT_SECRET,
    @Optional()
    private readonly clock: () => Date = () => new Date(),
    @Optional()
    private readonly nonce: () => string = randomUUID,
  ) {}

  issue(input: {
    organizationId: string;
    requestId: string;
    runId: string;
    agentInstanceId: string;
    capabilities?: readonly AgentApiCapability[];
    now?: Date;
  }): string {
    const secret = this.secret();
    const issuedAt = (input.now ?? this.clock()).getTime();
    const claims = AgentApiCapabilityGrantClaimsSchema.parse({
      version: 1,
      audience: 'kiditem-api-operation-command',
      organizationId: input.organizationId,
      requestId: input.requestId,
      runId: input.runId,
      agentInstanceId: input.agentInstanceId,
      capabilities: AgentApiCapabilityListSchema.parse(
        input.capabilities ?? [AGENT_API_CAPABILITY],
      ),
      issuedAt,
      expiresAt: issuedAt + AGENT_API_CAPABILITY_GRANT_TTL_MS,
      nonce: this.nonce(),
    });
    const payload = Buffer.from(fixedOrderJson(claims), 'utf8').toString(
      'base64url',
    );
    return `${payload}.${sign(payload, secret).toString('base64url')}`;
  }

  async verifyAndAuthorize(input: {
    token: string;
    capability: AgentApiCapability;
    now?: Date;
  }): Promise<AgentApiCapabilityPrincipal> {
    if (!AGENT_API_CAPABILITIES.includes(input.capability)) throw invalidGrant();
    const claims = this.verify(input.token, input.now ?? this.clock());
    if (!claims.capabilities.includes(input.capability)) throw invalidGrant();

    const request = await this.repository.findRunRequestById({
      organizationId: claims.organizationId,
      requestId: claims.requestId,
    });
    if (
      !request ||
      request.id !== claims.requestId ||
      request.organizationId !== claims.organizationId ||
      request.agentInstanceId !== claims.agentInstanceId ||
      request.status !== 'claimed' ||
      request.latestRunId !== claims.runId
    ) {
      throw unauthorizedGrant();
    }

    const run = await this.repository.findRunById({
      organizationId: claims.organizationId,
      runId: claims.runId,
    });
    if (
      !run ||
      run.id !== claims.runId ||
      run.organizationId !== claims.organizationId ||
      run.requestId !== claims.requestId ||
      run.agentInstanceId !== claims.agentInstanceId ||
      run.status !== 'running' ||
      run.finishedAt !== null
    ) {
      throw unauthorizedGrant();
    }

    return {
      organizationId: request.organizationId,
      requestId: request.id,
      runId: run.id,
      agentInstanceId: request.agentInstanceId,
      requestedByUserId: request.requestedByUserId,
    };
  }

  private verify(token: string, now: Date): AgentApiCapabilityGrantClaims {
    const secret = this.secret();
    if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
      throw invalidGrant();
    }
    const parts = token.split('.');
    if (parts.length !== 2) throw invalidGrant();
    const [encodedPayload, encodedSignature] = parts;
    if (
      !encodedPayload ||
      !encodedSignature ||
      encodedPayload.length > MAX_PAYLOAD_LENGTH ||
      !isCanonicalBase64Url(encodedPayload) ||
      !isCanonicalBase64Url(encodedSignature)
    ) {
      throw invalidGrant();
    }

    const receivedSignature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = sign(encodedPayload, secret);
    if (
      receivedSignature.byteLength !== expectedSignature.byteLength ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      throw invalidGrant();
    }

    let rawClaims: unknown;
    try {
      rawClaims = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      );
    } catch {
      throw invalidGrant();
    }
    const parsed = AgentApiCapabilityGrantClaimsSchema.safeParse(rawClaims);
    if (!parsed.success) throw invalidGrant();
    const claims = parsed.data;
    const nowMs = now.getTime();
    if (
      claims.issuedAt > nowMs ||
      nowMs >= claims.expiresAt ||
      claims.expiresAt - claims.issuedAt !==
        AGENT_API_CAPABILITY_GRANT_TTL_MS
    ) {
      throw invalidGrant();
    }
    return claims;
  }

  private secret(): Buffer {
    const secret = this.configuredSecret;
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('agent_api_capability_grant_secret_invalid');
    }
    return Buffer.from(secret, 'utf8');
  }
}

function fixedOrderJson(claims: AgentApiCapabilityGrantClaims): string {
  return JSON.stringify({
    version: claims.version,
    audience: claims.audience,
    organizationId: claims.organizationId,
    requestId: claims.requestId,
    runId: claims.runId,
    agentInstanceId: claims.agentInstanceId,
    capabilities: claims.capabilities,
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiresAt,
    nonce: claims.nonce,
  });
}

function normalizeCapabilities(
  capabilities: readonly AgentApiCapability[],
): AgentApiCapability[] {
  return AGENT_API_CAPABILITIES.filter((capability) =>
    capabilities.includes(capability),
  );
}

function sign(payload: string, secret: Buffer): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

function isCanonicalBase64Url(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64url').toString('base64url') === value;
  } catch {
    return false;
  }
}

function invalidGrant(): UnauthorizedException {
  return new UnauthorizedException(INVALID_GRANT);
}

function unauthorizedGrant(): UnauthorizedException {
  return new UnauthorizedException(UNAUTHORIZED_GRANT);
}
