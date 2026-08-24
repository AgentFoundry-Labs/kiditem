import { describe, expect, it } from 'vitest';
import { AgentResultEnvelopeSchema } from '@kiditem/shared/agent-interaction';
import { agentResultOutputSchema, normalizeProviderWireAgentResult } from './agent-result-output-schema';

describe('agentResultOutputSchema', () => {
  it('exports a strict bounded provider-wire schema for both provider protocols', () => {
    const schema = agentResultOutputSchema();
    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['outcome', 'summary', 'resourceRefs', 'operationRefs', 'needsInput', 'error'],
    });
    expect(record(schema.properties)).not.toHaveProperty('output');
    expect(strictSchemaViolations(schema)).toEqual([]);
    expect(JSON.stringify(schema)).not.toContain('credential');
  });

  it.each([
    [
      'completed',
      { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [], needsInput: null, error: null },
      { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] },
    ],
    [
      'needs_input',
      { outcome: 'needs_input', summary: 'input required', resourceRefs: [], operationRefs: [], needsInput: { code: 'need_sku', prompt: 'Provide a SKU.' }, error: null },
      { outcome: 'needs_input', summary: 'input required', resourceRefs: [], operationRefs: [], needsInput: { code: 'need_sku', prompt: 'Provide a SKU.' } },
    ],
    [
      'failed',
      { outcome: 'failed', summary: 'failed', resourceRefs: [], operationRefs: [], needsInput: null, error: { code: 'provider_failed', message: 'Try again.' } },
      { outcome: 'failed', summary: 'failed', resourceRefs: [], operationRefs: [], error: { code: 'provider_failed', message: 'Try again.' } },
    ],
  ])('normalizes strict nullable wire placeholders for %s without widening the shared envelope', (_outcome, wire, expected) => {
    expect(AgentResultEnvelopeSchema.parse(normalizeProviderWireAgentResult(wire))).toEqual(expected);
  });

  it('preserves shared envelope rejection for malformed non-null provider fields', () => {
    const wire = {
      outcome: 'needs_input', summary: 'input required', resourceRefs: [], operationRefs: [],
      needsInput: { code: '', prompt: 'Provide a SKU.' }, error: null,
    };

    expect(AgentResultEnvelopeSchema.safeParse(normalizeProviderWireAgentResult(wire)).success).toBe(false);
  });
});

function strictSchemaViolations(value: unknown, path = '$'): string[] {
  const schema = record(value);
  if (!schema) return [`${path}: schema node must be an object`];
  const violations: string[] = [];
  if (Object.keys(schema).length === 0) violations.push(`${path}: schema node must not be empty`);
  if (path === '$' && schema.anyOf !== undefined) violations.push('$: root schema must not use anyOf');

  const properties = record(schema.properties);
  const isObject = schema.type === 'object' || properties !== null;
  if (isObject) {
    if (schema.type !== 'object') violations.push(`${path}: object schema must declare type=object`);
    if (schema.additionalProperties !== false) violations.push(`${path}: object schema must set additionalProperties=false`);
    if (!properties) {
      violations.push(`${path}: object schema must declare properties`);
    } else {
      const required = Array.isArray(schema.required) ? schema.required.filter((field): field is string => typeof field === 'string') : [];
      for (const [name, child] of Object.entries(properties)) {
        if (!required.includes(name)) violations.push(`${path}.${name}: property must be required`);
        violations.push(...strictSchemaViolations(child, `${path}.${name}`));
      }
    }
  }

  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((child, index) => violations.push(...strictSchemaViolations(child, `${path}.anyOf[${index}]`)));
  }
  if (schema.items !== undefined) violations.push(...strictSchemaViolations(schema.items, `${path}.items`));
  return violations;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
