import { describe, expect, it } from 'vitest';
import { agentResultOutputSchema } from './agent-result-output-schema';

describe('agentResultOutputSchema', () => {
  it('exports a strict bounded AgentResultEnvelope schema for both provider protocols', () => {
    const schema = agentResultOutputSchema();
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['outcome', 'summary', 'resourceRefs', 'operationRefs'] });
    expect(JSON.stringify(schema)).not.toContain('credential');
  });
});
