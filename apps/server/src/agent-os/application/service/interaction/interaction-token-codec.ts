import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  AgentVersionNameSchema,
  AguiRunIdSchema,
  CopilotThreadIdSchema,
  NonNegativeDecimalSequenceSchema,
  OrganizationNameSchema,
  Sha256DigestSchema,
  UserNameSchema,
  parseAgentSessionName,
} from '@kiditem/shared/identifiers';
import { UserMessageEventPayloadSchema } from '@kiditem/shared/agent-interaction';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';

export const RUN_INTENT_TTL_MS = 30_000;
export const LIVE_JOIN_TTL_MS = 15_000;
export const REPLAY_CURSOR_TTL_MS = 15 * 60_000;
export const RUN_INTENT_DOMAIN = 'kiditem.agent-os.run-intent.v1';
export const REPLAY_CURSOR_DOMAIN = 'kiditem.agent-os.replay-cursor.v1';
export const LIVE_JOIN_DOMAIN = 'kiditem.agent-os.live-join.v1';

export const UserEventSchema = z.object({ externalEventId: z.string().min(1).max(128), schemaVersion: z.literal(1), payload: UserMessageEventPayloadSchema }).strict();
export const RunIntentClaimsSchema = z.object({ version: z.literal(1), organization: OrganizationNameSchema, user: UserNameSchema, agentVersion: AgentVersionNameSchema, copilotThreadId: CopilotThreadIdSchema, aguiRunId: AguiRunIdSchema, dashboardContextHash: Sha256DigestSchema, policyHash: Sha256DigestSchema, inputHash: Sha256DigestSchema, expiresAtMs: z.number().int().positive() }).strict();
export const ReplayCursorClaimsSchema = z.object({ version: z.literal(1), organization: OrganizationNameSchema, user: UserNameSchema, session: z.string().min(1).max(512), copilotThreadId: CopilotThreadIdSchema, afterSequence: NonNegativeDecimalSequenceSchema, expiresAtMs: z.number().int().positive() }).strict().superRefine(sessionOrganization);
export const LiveJoinClaimsSchema = z.object({ version: z.literal(1), organization: OrganizationNameSchema, user: UserNameSchema, session: z.string().min(1).max(512), copilotThreadId: CopilotThreadIdSchema, contextEpoch: z.number().int().positive(), afterSequence: NonNegativeDecimalSequenceSchema, expiresAtMs: z.number().int().positive() }).strict().superRefine(sessionOrganization);
export type RunIntentClaims = z.infer<typeof RunIntentClaimsSchema>;

function sessionOrganization(value: { session: string; organization: string }, context: z.RefinementCtx) {
  try { parseAgentSessionName(value.session, value.organization); } catch { context.addIssue({ code: z.ZodIssueCode.custom, path: ['session'], message: 'session must belong to the claimed organization' }); }
}

/** Internal interaction-only HMAC codec; it is intentionally not re-exported. */
export class InteractionTokenCodec {
  static hash(value: unknown): string { return createHash('sha256').update(this.canonicalJson(value)).digest('hex'); }
  static canonicalJson(value: unknown): string {
    const encoded = JSON.stringify(this.sortCanonical(value));
    if (encoded === undefined) throw boundary('INTERACTION_CANONICALIZATION_INVALID', 'The interaction payload cannot be canonicalized.');
    return encoded;
  }
  static sign(claims: object, key: Buffer, domain: string): string {
    const encoded = Buffer.from(this.canonicalJson(claims)).toString('base64url');
    const signature = createHmac('sha256', key).update(domain).update('\0').update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }
  static verify<T extends z.ZodTypeAny>(token: string, key: Buffer, domain: string, schema: T, errorCode: string): z.infer<T> {
    try {
      const parts = token.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1] || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) throw new Error('invalid token shape');
      const actual = Buffer.from(parts[1], 'base64url');
      const expected = createHmac('sha256', key).update(domain).update('\0').update(parts[0]).digest();
      if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) throw new Error('invalid token signature');
      return schema.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')));
    } catch (error) { if (error instanceof AgentOsBoundaryError) throw error; throw boundary(errorCode, 'The signed interaction token is invalid.'); }
  }
  static parse<T extends z.ZodTypeAny>(schema: T, value: unknown, code: string): z.infer<T> { try { return schema.parse(value); } catch { throw boundary(code, 'The interaction request payload is invalid.'); } }
  static local<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> { try { return schema.parse(value); } catch { throw boundary('INTERACTION_INTERNAL_CLAIMS_INVALID', 'The interaction claims could not be constructed.'); } }
  static response<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> { try { return schema.parse(value); } catch { throw boundary('INTERACTION_RESPONSE_INVALID', 'The interaction response violates its boundary contract.'); } }
  private static sortCanonical(value: unknown): unknown { if (Array.isArray(value)) return value.map((entry) => this.sortCanonical(entry)); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, this.sortCanonical(nested)])); return value; }
}

function boundary(code: string, message: string): AgentOsBoundaryError { return new AgentOsBoundaryError(code, message); }
