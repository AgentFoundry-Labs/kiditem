import { describe, expect, it } from 'vitest';
import { z as z4 } from 'zod-v4';
import {
  ATTEMPT_MCP_TOOL_NAMES,
  AttemptMcpWireInputSchemas,
} from './attempt-mcp-wire-contract';

describe('Attempt MCP v2 wire contract', () => {
  it('publishes exactly the eleven transport tools with Zod 4 input schemas', () => {
    expect(ATTEMPT_MCP_TOOL_NAMES).toEqual([
      'capability_catalog_search',
      'capability_invoke',
      'invocation_status',
      'invocation_wait',
      'invocation_result',
      'delegate_to_agent',
      'child_status',
      'child_wait',
      'child_result',
      'child_message',
      'child_interrupt',
    ]);
    expect(Object.keys(AttemptMcpWireInputSchemas)).toEqual(ATTEMPT_MCP_TOOL_NAMES);
    for (const schema of Object.values(AttemptMcpWireInputSchemas)) {
      expect(schema).toBeInstanceOf(z4.ZodType);
    }
  });

  it('rejects unknown keys on every strict object input', () => {
    const valid: Record<(typeof ATTEMPT_MCP_TOOL_NAMES)[number], Record<string, unknown>> = {
      capability_catalog_search: { query: '' },
      capability_invoke: { capabilityKey: 'sourcing.scrapeProductUrl', input: {} },
      invocation_status: { invocationId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' },
      invocation_wait: { invocationId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' },
      invocation_result: { invocationId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' },
      delegate_to_agent: { targetAgentKey: 'sourcing', objective: 'Review the selected product.' },
      child_status: { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' },
      child_wait: { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' },
      child_result: { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' },
      child_message: { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de', message: 'Please continue.', messageCommandKey: 'child-message-key-1' },
      child_interrupt: { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' },
    };

    for (const name of ATTEMPT_MCP_TOOL_NAMES) {
      expect(AttemptMcpWireInputSchemas[name].safeParse({ ...valid[name], forged: true }).success)
        .toBe(false);
    }
  });

  it('requires a bounded caller-owned message command key for exact child-message replay', () => {
    const schema = AttemptMcpWireInputSchemas.child_message;
    const common = { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de', message: 'Please continue.' };

    expect(schema.safeParse(common).success).toBe(false);
    expect(schema.safeParse({ ...common, messageCommandKey: 'child-message-key-1' }).success).toBe(true);
    expect(schema.safeParse({ ...common, messageCommandKey: '   ' }).success).toBe(false);
    expect(schema.safeParse({ ...common, messageCommandKey: 'x'.repeat(257) }).success).toBe(false);
  });

  it('requires delegation capability and input together', () => {
    const schema = AttemptMcpWireInputSchemas.delegate_to_agent;
    expect(schema.safeParse({ targetAgentKey: 'sourcing', objective: 'Review', capabilityKey: 'sourcing.ingestCandidate' }).success).toBe(false);
    expect(schema.safeParse({ targetAgentKey: 'sourcing', objective: 'Review', input: {} }).success).toBe(false);
    expect(schema.safeParse({ targetAgentKey: 'sourcing', objective: 'Review', capabilityKey: 'sourcing.ingestCandidate', input: {} }).success).toBe(true);
  });

  it('converts strict inputs to JSON Schema 2020-12 without opening objects', () => {
    for (const schema of Object.values(AttemptMcpWireInputSchemas)) {
      const jsonSchema = z4.toJSONSchema(schema) as Record<string, unknown>;
      expect(jsonSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(jsonSchema.additionalProperties).toBe(false);
    }
  });
});
