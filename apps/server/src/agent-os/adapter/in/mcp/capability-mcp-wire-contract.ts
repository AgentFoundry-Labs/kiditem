import { z as z4 } from 'zod-v4';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type { CapabilityDefinition } from '../../../../common/capability-definition';

/** The only protocol revision accepted by the private capability endpoint. */
export const MCP_PROTOCOL_VERSION = '2026-07-28';
export const MCP_JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** Keep the public tool surface small, explicit, and independently testable. */
export const CAPABILITY_MCP_TOOL_NAMES = [
  'capability_catalog_search',
  'capability_invoke',
  'invocation_status',
  'operation_status',
  'readiness_probe',
] as const;

export type CapabilityMcpToolName = (typeof CAPABILITY_MCP_TOOL_NAMES)[number];

const BOUNDED_JSON_MAX_BYTES = 64 * 1024;
const BOUNDED_JSON_MAX_DEPTH = 8;
const BOUNDED_JSON_MAX_ITEMS = 100;
const BOUNDED_JSON_MAX_KEY_LENGTH = 128;

/**
 * Transport-level bounded JSON. Owner definitions parse the same value again
 * with their own strict business schema before any owner port is invoked.
 */
export const BoundedCanonicalJson = z4.unknown().superRefine((value, context) => {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || new TextEncoder().encode(encoded).byteLength > BOUNDED_JSON_MAX_BYTES) {
      context.addIssue({ code: 'custom', message: 'bounded_canonical_json_required' });
      return;
    }
    if (!isBoundedJson(value, 0)) {
      context.addIssue({ code: 'custom', message: 'bounded_canonical_json_required' });
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'bounded_canonical_json_required' });
  }
});

export const CapabilityCatalogSearchInputSchema = z4
  .object({ query: z4.string().trim().min(1).max(200).optional() })
  .strict();

/** Metadata envelope only; it is deliberately outside every owner business schema. */
export const CapabilityInvokeInputSchema = z4
  .object({
    requestKey: z4.string().trim().min(1).max(200).optional(),
    actingAgentKey: z4.string().trim().min(1).max(100).optional(),
    capabilityKey: z4.string().trim().min(1).max(200),
    input: BoundedCanonicalJson,
  })
  .strict();

export const InvocationStatusInputSchema = z4
  .object({ invocationId: z4.string().uuid() })
  .strict();

export const OperationStatusInputSchema = z4
  .object({ operationId: z4.string().uuid() })
  .strict();

export const ReadinessProbeInputSchema = z4.object({}).strict();

export const CapabilityResultReceiptWireSchema = z4
  .object({
    summary: z4.string().min(1).max(1_000),
    resourceRefs: z4.array(z4.object({
      kind: z4.string().min(1).max(64),
      id: z4.string().min(1).max(128),
      version: z4.string().min(1).max(128).nullable(),
    }).strict()).max(50),
    operationRefs: z4.array(z4.object({
      kind: z4.string().min(1).max(64),
      id: z4.string().min(1).max(128),
    }).strict()).max(50),
  })
  .strict();

export const CapabilityResultEnvelopeWireSchema = CapabilityResultReceiptWireSchema.extend({
  output: BoundedCanonicalJson.optional(),
}).strict();

export const InvocationReceiptWireSchema = z4
  .object({
    id: z4.string().uuid(),
    status: z4.enum(['pending', 'succeeded', 'failed']),
    approvalStatus: z4.enum(['not_required', 'pending', 'approved', 'rejected', 'expired']),
    retryWithSameRequestKey: z4.boolean(),
  })
  .strict();

export const CapabilityMcpErrorWireSchema = z4
  .object({
    code: z4.string().min(1).max(128),
    message: z4.string().min(1).max(1_000),
  })
  .strict();

const CatalogEntrySchema = z4
  .object({
    key: z4.string().min(1).max(200),
    ownerDomain: z4.string().min(1).max(100),
    description: z4.string().min(1).max(2_000),
    effects: z4.array(z4.enum([
      'read',
      'browser',
      'external_io',
      'llm',
      'db_write',
      'external_write',
      'job_enqueue',
    ])).min(1).max(10),
    approvalRisk: z4.enum(['none', 'low', 'medium', 'high']),
    idempotency: z4.enum(['none', 'recommended', 'required']),
    inputSchema: z4.record(z4.string(), z4.unknown()),
    outputSchema: z4.record(z4.string(), z4.unknown()),
  })
  .strict();

export const CapabilityCatalogSearchOutputSchema = z4
  .object({ capabilities: z4.array(CatalogEntrySchema).max(17) })
  .strict();

export const CapabilityInvokeOutputSchema = z4.union([
  z4.object({
    kind: z4.literal('completed'),
    invocation: z4.null(),
    result: CapabilityResultEnvelopeWireSchema,
  }).strict(),
  z4.object({
    kind: z4.literal('completed'),
    invocation: InvocationReceiptWireSchema,
    result: CapabilityResultReceiptWireSchema,
  }).strict(),
  z4.object({
    kind: z4.literal('pending'),
    invocation: InvocationReceiptWireSchema,
  }).strict(),
  z4.object({
    kind: z4.literal('error'),
    error: CapabilityMcpErrorWireSchema,
  }).strict(),
]);

const InvocationStatusSuccessOutputSchema = z4
  .object({
    invocation: InvocationReceiptWireSchema.extend({
      result: CapabilityResultReceiptWireSchema.nullable(),
      error: CapabilityMcpErrorWireSchema.nullable(),
      approvalExpiresAt: z4.string().datetime({ offset: true }).nullable(),
    }),
  })
  .strict();

const OperationStatusSuccessOutputSchema = z4
  .object({
    operation: z4.object({
      id: z4.string().uuid(),
      operationKey: z4.string().min(1).max(200),
      status: z4.enum([
        'queued',
        'waiting_runtime',
        'waiting_dependency',
        'running',
        'attention_required',
        'succeeded',
        'failed',
        'cancelled',
        'skipped',
      ]),
      stage: z4.string().min(1).max(80).nullable(),
      progress: z4.number().min(0).max(1).nullable(),
      error: CapabilityMcpErrorWireSchema.nullable(),
    }).strict(),
  })
  .strict();

const ReadinessProbeSuccessOutputSchema = z4
  .object({
    protocolVersion: z4.literal(MCP_PROTOCOL_VERSION),
    sdkGeneration: z4.literal('v2'),
    protocolNegotiation: z4.literal('auto'),
    toolNames: z4.tuple([
      z4.literal('capability_catalog_search'),
      z4.literal('capability_invoke'),
      z4.literal('invocation_status'),
      z4.literal('operation_status'),
      z4.literal('readiness_probe'),
    ]),
  })
  .strict();

const StructuredErrorOutputSchema = z4
  .object({ kind: z4.literal('error'), error: CapabilityMcpErrorWireSchema })
  .strict();

export const InvocationStatusOutputSchema = z4.union([
  InvocationStatusSuccessOutputSchema,
  StructuredErrorOutputSchema,
]);

export const OperationStatusOutputSchema = z4.union([
  OperationStatusSuccessOutputSchema,
  StructuredErrorOutputSchema,
]);

export const ReadinessProbeOutputSchema = z4.union([
  ReadinessProbeSuccessOutputSchema,
  StructuredErrorOutputSchema,
]);

export const CapabilityMcpWireInputSchemas = {
  capability_catalog_search: CapabilityCatalogSearchInputSchema,
  capability_invoke: CapabilityInvokeInputSchema,
  invocation_status: InvocationStatusInputSchema,
  operation_status: OperationStatusInputSchema,
  readiness_probe: ReadinessProbeInputSchema,
} as const;

export const CapabilityMcpWireOutputSchemas = {
  capability_catalog_search: CapabilityCatalogSearchOutputSchema,
  capability_invoke: CapabilityInvokeOutputSchema,
  invocation_status: InvocationStatusOutputSchema,
  operation_status: OperationStatusOutputSchema,
  readiness_probe: ReadinessProbeOutputSchema,
} as const;

export type CapabilityCatalogEntry = z4.infer<typeof CatalogEntrySchema>;

/** Convert owner Zod v3 contracts for discovery without widening their schema. */
export function capabilityDefinitionToCatalogEntry(
  definition: CapabilityDefinition,
): CapabilityCatalogEntry {
  return {
    key: definition.key,
    ownerDomain: definition.ownerDomain,
    description: definition.description,
    effects: [...definition.effects],
    approvalRisk: definition.approvalRisk,
    idempotency: definition.idempotency,
    inputSchema: jsonSchema202012(definition.inputSchema),
    outputSchema: jsonSchema202012(definition.outputSchema),
  };
}

/** Owner schemas are Zod v3 today; only their serialized discoverability crosses this seam. */
export function jsonSchema202012(schema: z.ZodTypeAny): Record<string, unknown> {
  // zod-to-json-schema's generic return recursively expands real owner
  // schemas under `strict` TypeScript builds; discovery is intentionally an
  // erased JSON boundary, so retain only its concrete runtime contract here.
  const convert = zodToJsonSchema as unknown as (
    input: z.ZodTypeAny,
    options: { target: 'jsonSchema7' },
  ) => Record<string, unknown>;
  const generated = convert(schema, { target: 'jsonSchema7' });
  const { $schema: _legacyDialect, ...withoutLegacyDialect } = generated;
  return {
    $schema: MCP_JSON_SCHEMA_DIALECT,
    ...(jsonSchema202012Subset(withoutLegacyDialect) as Record<string, unknown>),
  };
}

/** `definitions`/`#/definitions` are Draft-7 spelling; 2020-12 uses `$defs`. */
function jsonSchema202012Subset(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSchema202012Subset);
  if (!value || typeof value !== 'object') {
    return typeof value === 'string'
      ? value.replace(/^#\/definitions\//, '#/$defs/')
      : value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
    key === 'definitions' ? '$defs' : key,
    jsonSchema202012Subset(nested),
  ]));
}

function isBoundedJson(value: unknown, depth: number): boolean {
  if (depth > BOUNDED_JSON_MAX_DEPTH) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.length <= BOUNDED_JSON_MAX_ITEMS
      && value.every((item) => isBoundedJson(item, depth + 1));
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length <= BOUNDED_JSON_MAX_ITEMS
      && entries.every(([key, item]) => key.length <= BOUNDED_JSON_MAX_KEY_LENGTH
        && isBoundedJson(item, depth + 1));
  }
  return false;
}
