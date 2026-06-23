import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
};

function schemaPath(): string {
  return resolve(
    process.cwd(),
    '..',
    '..',
    'agent-config',
    'schemas',
    'operator-decision.schema.json',
  );
}

function isObjectSchema(schema: JsonSchema): boolean {
  return schema.type === 'object' || (
    Array.isArray(schema.type) && schema.type.includes('object')
  );
}

function assertStructuredOutputObjectSchema(
  schema: JsonSchema,
  path = '$',
): void {
  if (isObjectSchema(schema) && schema.properties) {
    expect(schema.additionalProperties, `${path}.additionalProperties`).toBe(
      false,
    );
    expect(new Set(schema.required ?? []), `${path}.required`).toEqual(
      new Set(Object.keys(schema.properties)),
    );
  }

  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    assertStructuredOutputObjectSchema(child, `${path}.properties.${key}`);
  }
  if (schema.items) {
    assertStructuredOutputObjectSchema(schema.items, `${path}.items`);
  }
}

describe('OperatorDecision OpenAI structured output schema', () => {
  it('uses the strict object subset required by OpenAI Responses Structured Outputs', () => {
    const schema = JSON.parse(readFileSync(schemaPath(), 'utf8')) as JsonSchema;

    assertStructuredOutputObjectSchema(schema);
  });

  it('allows purchase-order submission decisions to carry external order platform', () => {
    const schema = JSON.parse(readFileSync(schemaPath(), 'utf8')) as JsonSchema;
    const taskInput = schema.properties?.taskInput;

    expect(taskInput?.properties).toHaveProperty('externalOrderPlatform');
    expect(taskInput?.required).toContain('externalOrderPlatform');
  });
});
