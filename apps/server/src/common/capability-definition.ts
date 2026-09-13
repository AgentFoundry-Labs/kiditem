import type { z } from 'zod';

export type CapabilityOwnerDomain =
  | 'analytics'
  | 'channels'
  | 'products'
  | 'sourcing'
  | 'supply';

export type CapabilityEffect =
  | 'read'
  | 'browser'
  | 'external_io'
  | 'db_write'
  | 'external_write'
  | 'job_enqueue';

export type CapabilityApprovalRisk = 'none' | 'low' | 'medium' | 'high';
export type CapabilityIdempotency = 'recommended' | 'required';

export const MUTATION_EFFECTS = new Set<CapabilityEffect>([
  'db_write',
  'external_write',
  'job_enqueue',
]);

/** Code-owned final manifest: domain business schemas and owner port identity. */
export interface CapabilityDefinition {
  key: string;
  ownerDomain: CapabilityOwnerDomain;
  description: string;
  /** Bounded user-facing completion copy owned beside the business capability. */
  resultSummary: string;
  inputSchema: z.ZodType<Record<string, unknown>>;
  outputSchema: z.ZodType<Record<string, unknown>>;
  effects: readonly CapabilityEffect[];
  approvalRisk: CapabilityApprovalRisk;
  idempotency: CapabilityIdempotency;
  ownerInputPort: string;
}

export function assertCapabilityDefinitions(
  definitions: readonly CapabilityDefinition[],
): void {
  const keys = new Set<string>();
  for (const definition of definitions) {
    if (
      typeof definition.resultSummary !== 'string'
      || !definition.resultSummary.trim()
      || definition.resultSummary.trim().length > 1_000
      || !/[가-힣]/.test(definition.resultSummary)
    ) {
      throw new Error(`Capability result summary must be bounded Korean user-facing copy: ${definition.key}`);
    }
    if (!definition.key.startsWith(`${definition.ownerDomain}.`)) {
      throw new Error(`Capability key must be owner-prefixed: ${definition.key}`);
    }
    if (!definition.ownerInputPort.trim().startsWith(`${definition.ownerDomain}.`)) {
      throw new Error(`Capability owner input port must be owner-qualified: ${definition.key}`);
    }
    if (keys.has(definition.key)) {
      throw new Error(`Duplicate capability definition: ${definition.key}`);
    }
    keys.add(definition.key);
    const mutation = definition.effects.some((effect) => MUTATION_EFFECTS.has(effect));
    if (!mutation && (definition.approvalRisk === 'medium' || definition.approvalRisk === 'high')) {
      throw new Error(`Queries cannot require medium/high approval: ${definition.key}`);
    }
    if (mutation && definition.idempotency !== 'required') {
      throw new Error(`Mutations require idempotency: ${definition.key}`);
    }
  }
}
