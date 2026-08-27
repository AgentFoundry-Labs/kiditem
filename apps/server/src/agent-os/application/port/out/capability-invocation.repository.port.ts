import { z } from 'zod';
import {
  BoundedCanonicalJsonSchema,
  CapabilityInvocationApprovalStatusSchema,
  CapabilityInvocationErrorSchema,
  CapabilityInvocationStatusSchema,
  CapabilityResultReceiptSchema,
} from '@kiditem/shared/agent-interaction';

export const CAPABILITY_INVOCATION_REPOSITORY_PORT = Symbol(
  'CAPABILITY_INVOCATION_REPOSITORY_PORT',
);

const UuidSchema = z.string().uuid();
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** Strict boundary between Prisma/SQL rows and the application layer. */
export const CapabilityInvocationRecordSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    initiatingUserId: UuidSchema,
    capabilityKey: z.string().trim().min(1).max(256),
    actingAgentKey: z.string().trim().min(1).max(128),
    requestKey: z.string().trim().min(1).max(256),
    canonicalInput: BoundedCanonicalJsonSchema,
    inputHash: HashSchema,
    status: CapabilityInvocationStatusSchema,
    approvalStatus: CapabilityInvocationApprovalStatusSchema,
    approvalInputHash: HashSchema.nullable(),
    approvalRequestedAt: z.date().nullable(),
    approvalExpiresAt: z.date().nullable(),
    approvalDecidedByUserId: UuidSchema.nullable(),
    approvalDecisionReason: z.string().trim().min(1).max(1_000).nullable(),
    approvalDecidedAt: z.date().nullable(),
    result: CapabilityResultReceiptSchema.nullable(),
    error: CapabilityInvocationErrorSchema.nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
    finishedAt: z.date().nullable(),
  })
  .strict();

export type CapabilityInvocationRecord = z.infer<
  typeof CapabilityInvocationRecordSchema
>;

export interface InvocationFence {
  organizationId: string;
  invocationId: string;
}

export interface InvocationRequestKeyFence {
  organizationId: string;
  requestKey: string;
}

export interface AdmitCapabilityInvocation {
  organizationId: string;
  initiatingUserId: string;
  capabilityKey: string;
  actingAgentKey: string;
  requestKey: string;
  canonicalInput: unknown;
  inputHash: string;
  approval: {
    required: boolean;
    requestedAt: Date;
    expiresAt: Date | null;
  };
}

export type AdmissionResult =
  | { kind: 'created'; invocation: CapabilityInvocationRecord }
  | { kind: 'replay'; invocation: CapabilityInvocationRecord }
  | { kind: 'conflict'; invocation: CapabilityInvocationRecord };

export interface DecideInvocationApproval extends InvocationFence {
  userId: string;
  inputHash: string;
  decision: 'approved' | 'rejected';
  reason: string | null;
  decidedAt: Date;
}

export interface RecordInvocationSucceeded extends InvocationFence {
  result: z.infer<typeof CapabilityResultReceiptSchema>;
  finishedAt: Date;
}

export interface RecordInvocationFailure extends InvocationFence {
  error: z.infer<typeof CapabilityInvocationErrorSchema>;
  finishedAt: Date;
}

/**
 * State-specific commands only. There is deliberately no generic update,
 * queue claim, lease, schedule, or recovery API for an Invocation.
 */
export interface CapabilityInvocationRepositoryPort {
  admit(input: AdmitCapabilityInvocation): Promise<AdmissionResult>;
  findById(input: InvocationFence): Promise<CapabilityInvocationRecord | null>;
  findByRequestKey(
    input: InvocationRequestKeyFence,
  ): Promise<CapabilityInvocationRecord | null>;
  decideApproval(
    input: DecideInvocationApproval,
  ): Promise<CapabilityInvocationRecord>;
  recordSucceeded(
    input: RecordInvocationSucceeded,
  ): Promise<CapabilityInvocationRecord>;
  recordKnownFailure(
    input: RecordInvocationFailure,
  ): Promise<CapabilityInvocationRecord>;
}
