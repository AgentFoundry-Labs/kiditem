import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'src');
const handlerPort = resolve(
  root,
  'agent-os/application/port/out/capability/agent-capability-handler.port.ts',
);
const retainedAdapters = [
  'agent-os/adapter/in/agent/agent-os-platform-probe-capability.adapter.ts',
  'agent-os/adapter/in/agent/analytics-overview-agent-capability.adapter.ts',
  'ai/adapter/in/agent/ai-wing-registration-capability.adapter.ts',
  'sourcing/adapter/in/agent/market-shadow-signal-capability.adapter.ts',
  'sourcing/adapter/in/agent/sourcing-collection-capability.adapter.ts',
  'sourcing/adapter/in/agent/sourcing-listing-prep-capability.adapter.ts',
  'sourcing/adapter/in/agent/sourcing-scrape-url-capability.adapter.ts',
  'sourcing/adapter/in/agent/sourcing-workspace-capability.adapter.ts',
  'supply/adapter/in/agent/supply-agent-capability.adapter.ts',
];

describe('Agent capability official execution context contract', () => {
  it('exposes only the canonical AgentSession execution coordinates', async () => {
    const source = await readFile(handlerPort, 'utf8');

    for (const field of [
      'organization: OrganizationName',
      'actor: UserName | null',
      'agentVersion: AgentVersionName',
      'session: AgentSessionName',
      'task: AgentSessionTaskName',
      'execution: AgentExecutionName',
      'attempt: AgentExecutionAttemptName',
      'operation: OperationRunName',
      'requestId: RequestId',
    ]) {
      expect(source).toContain(field);
    }
    for (const legacyField of [
      'organizationId:', 'conversationId', 'agentInstanceId', 'agentType:',
      'runId', 'requestedByUserId', 'sessionId:', 'executionId:',
    ]) {
      expect(source).not.toContain(legacyField);
    }
  });

  it.each(retainedAdapters)(
    '%s has no legacy capability lineage dependency',
    async (adapter) => {
      const source = await readFile(resolve(root, adapter), 'utf8');
      for (const legacyField of [
        /execution(?:Input)?\.conversationId/,
        /execution(?:Input)?\.agentInstanceId/,
        /execution(?:Input)?\.agentType/,
        /execution(?:Input)?\.runId/,
        /execution(?:Input)?\.requestedByUserId/,
        /AgentRuntimeExecutionContext/,
      ]) {
        expect(source).not.toMatch(legacyField);
      }
    },
  );
});
