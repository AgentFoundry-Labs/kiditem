/**
 * Strict provider-wire form of the bounded AgentResultEnvelope fields.
 * Providers require every object field, so nullable fields are normalized
 * back to the shared optional-envelope shape before validation.
 */
export function agentResultOutputSchema(): Record<string, unknown> {
  const resourceRef = strictObject(['kind', 'id', 'version'], {
    kind: { type: 'string', minLength: 1, maxLength: 64 },
    id: { type: 'string', minLength: 1, maxLength: 128 },
    version: nullable({ type: 'string', minLength: 1, maxLength: 128 }),
  });
  const operationRef = strictObject(['kind', 'id'], {
    kind: { type: 'string', minLength: 1, maxLength: 64 },
    id: { type: 'string', minLength: 1, maxLength: 128 },
  });
  const needsInput = strictObject(['code', 'prompt'], {
    code: { type: 'string', minLength: 1, maxLength: 128 },
    prompt: { type: 'string', minLength: 1, maxLength: 1_000 },
  });
  const error = strictObject(['code', 'message'], {
    code: { type: 'string', minLength: 1, maxLength: 128 },
    message: { type: 'string', minLength: 1, maxLength: 1_000 },
  });
  return {
    type: 'object', additionalProperties: false, required: ['outcome', 'summary', 'resourceRefs', 'operationRefs', 'needsInput', 'error'],
    properties: {
      outcome: { type: 'string', enum: ['completed', 'needs_input', 'failed'] },
      summary: { type: 'string', minLength: 1, maxLength: 1_000 },
      resourceRefs: { type: 'array', maxItems: 50, items: resourceRef },
      operationRefs: { type: 'array', maxItems: 50, items: operationRef },
      needsInput: nullable(needsInput),
      error: nullable(error),
    },
  };
}

/** Drops only required-on-wire null placeholders before shared-envelope validation. */
export function normalizeProviderWireAgentResult(value: unknown): unknown {
  const envelope = record(value);
  if (!envelope) return value;
  const normalized = { ...envelope };
  if (Object.hasOwn(envelope, 'needsInput') && envelope.needsInput === null) delete normalized.needsInput;
  if (Object.hasOwn(envelope, 'error') && envelope.error === null) delete normalized.error;
  return normalized;
}

function strictObject(required: readonly string[], properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, required: [...required], properties };
}

function nullable(schema: Record<string, unknown>): Record<string, unknown> {
  return { anyOf: [schema, { type: 'null' }] };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
