/** JSON-schema form of the bounded shared AgentResultEnvelope contract. */
export function agentResultOutputSchema(): Record<string, unknown> {
  const resourceRef = { type: 'object', additionalProperties: false, required: ['kind', 'id', 'version'], properties: { kind: { type: 'string', minLength: 1, maxLength: 64 }, id: { type: 'string', minLength: 1, maxLength: 128 }, version: { anyOf: [{ type: 'string', minLength: 1, maxLength: 128 }, { type: 'null' }] } } };
  const operationRef = { type: 'object', additionalProperties: false, required: ['kind', 'id'], properties: { kind: { type: 'string', minLength: 1, maxLength: 64 }, id: { type: 'string', minLength: 1, maxLength: 128 } } };
  return {
    type: 'object', additionalProperties: false, required: ['outcome', 'summary', 'resourceRefs', 'operationRefs'],
    properties: {
      outcome: { enum: ['completed', 'needs_input', 'failed'] }, summary: { type: 'string', minLength: 1, maxLength: 1_000 },
      resourceRefs: { type: 'array', maxItems: 50, items: resourceRef }, operationRefs: { type: 'array', maxItems: 50, items: operationRef },
      needsInput: { type: 'object', additionalProperties: false, required: ['code', 'prompt'], properties: { code: { type: 'string', minLength: 1, maxLength: 128 }, prompt: { type: 'string', minLength: 1, maxLength: 1_000 } } },
      error: { type: 'object', additionalProperties: false, required: ['code', 'message'], properties: { code: { type: 'string', minLength: 1, maxLength: 128 }, message: { type: 'string', minLength: 1, maxLength: 1_000 } } },
      output: {},
    },
  };
}
