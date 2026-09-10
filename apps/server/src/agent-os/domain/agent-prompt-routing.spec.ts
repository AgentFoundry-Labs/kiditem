import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_DEFINITIONS } from './agent-definition.registry';

const profile = (name: string) => readFileSync(
  join(process.cwd(), '..', '..', 'agent-config', 'prompts', 'agents', `${name}.md`),
  'utf8',
);

describe('provider-native Agent profile routing', () => {
  it('keeps exactly the five business Agent profiles and removes Operator', () => {
    expect(AGENT_DEFINITIONS.map(({ key }) => key)).toEqual([
      'sourcing',
      'merchandising',
      'supply',
      'channel_operations',
      'advertising',
    ]);
    expect(existsSync(join(process.cwd(), '..', '..', 'agent-config', 'prompts', 'agents', 'operator.md'))).toBe(false);
  });

  it('has no Operator publication or server-runtime reference', () => {
    const roots = [
      join(process.cwd(), '..', '..', 'agent-config'),
      join(process.cwd(), 'agent-config'),
    ];
    const forbidden = /\bOperator\b|AGENT_OPERATOR_MODEL|agentDefinitions\/operator|OperatorDecision/;
    const matches = roots.flatMap((root) => files(root)
      .filter((file) => forbidden.test(readFileSync(file, 'utf8'))));

    expect(matches).toEqual([]);
  });

  it('requires direct reads, native cross-domain mutation subagents, explicit acting keys, and reference-only business results', () => {
    for (const key of AGENT_DEFINITIONS.map(({ key: agentKey }) => agentKey)) {
      const prompt = normalized(profile(key));
      expect(prompt).toContain('cross-domain read');
      expect(prompt).toContain('provider-native subagent');
      expect(prompt).toContain('actingAgentKey');
      expect(prompt).toContain('resourceRefs');
      expect(prompt).toContain('invocation_status');
      expect(prompt).not.toContain('operationRefs');
      expect(prompt).not.toContain('operation_status');
      expect(prompt).toContain('Never invent an Agent, grant, Task, child Task');
      expect(prompt).toContain('never a UI href');
      expect(prompt).not.toContain('AgentTask');
    }

    const chat = normalized(profile('chat'));
    expect(chat).toContain('no acting Agent');
    expect(chat).toContain('reads directly');
    expect(chat).toContain('provider-native subagent');
    expect(chat).toContain('Before any mutation');
  });
});

function normalized(value: string): string {
  return value.replace(/\s+/g, ' ');
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
