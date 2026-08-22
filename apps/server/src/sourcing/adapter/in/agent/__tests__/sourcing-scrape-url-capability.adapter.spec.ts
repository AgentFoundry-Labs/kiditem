import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityRegistry } from '../../../../../agent-os/application/service/agent-capability-registry.service';
import type { SourcingScrapeOperationPort } from '../../../../application/port/out/cross-domain/sourcing-scrape-operation.port';
import { SourcingScrapeUrlCapabilityAdapter } from '../sourcing-scrape-url-capability.adapter';

const officialExecution = (input: Record<string, unknown>) => ({
  organization: 'organizations/org-1',
  actor: 'users/user-1',
  agentVersion: 'agentDefinitions/sourcing/versions/1',
  session: 'organizations/org-1/agentSessions/session-1',
  task: 'organizations/org-1/agentSessions/session-1/tasks/task-1',
  execution: 'organizations/org-1/agentSessions/session-1/executions/execution-1',
  attempt: 'organizations/org-1/agentSessions/session-1/executions/execution-1/attempts/attempt-1',
  operation: 'organizations/org-1/operations/operation-1',
  requestId: '00000000-0000-4000-8000-000000000001',
  input,
});

describe('SourcingScrapeUrlCapabilityAdapter', () => {
  it.each([
    ['sourcing.scrapeUrlWorkflow', 'workflow'],
    ['sourcing.scrapeProductUrl', 'tool'],
  ])('routes %s through the official owned Operation port', async (key, executionKind) => {
    const registry = { register: vi.fn() } as unknown as AgentCapabilityRegistry;
    const operations = {
      startDirect: vi.fn(),
      startOfficial: vi.fn().mockResolvedValue({ operationRunId: 'operation-child-1', status: 'queued' }),
    } as unknown as SourcingScrapeOperationPort;
    const adapter = new SourcingScrapeUrlCapabilityAdapter(registry, operations);
    adapter.onModuleInit();
    const handler = vi.mocked(registry.register).mock.calls
      .map(([registered]) => registered)
      .find((registered) => registered.key === key)!;

    const result = await handler.execute(officialExecution({
      sourceUrl: 'https://detail.1688.com/offer/123.html',
    }) as never);

    expect(handler.executionKind).toBe(executionKind);
    expect(operations.startOfficial).toHaveBeenCalledWith(expect.objectContaining({
      execution: expect.objectContaining({
        session: 'organizations/org-1/agentSessions/session-1',
        operation: 'organizations/org-1/operations/operation-1',
      }),
      sourceUrl: 'https://detail.1688.com/offer/123.html',
    }));
    expect(operations.startDirect).not.toHaveBeenCalled();
    expect(result.resourceId).toBe('operation-child-1');
  });

  it('uses request identity plus URL owner key for equivalent sourceUrl and url aliases', () => {
    const registry = { register: vi.fn() } as unknown as AgentCapabilityRegistry;
    const operations = { startDirect: vi.fn(), startOfficial: vi.fn() } as unknown as SourcingScrapeOperationPort;
    const adapter = new SourcingScrapeUrlCapabilityAdapter(registry, operations);
    adapter.onModuleInit();
    const handler = vi.mocked(registry.register).mock.calls
      .map(([registered]) => registered)
      .find((registered) => registered.key === 'sourcing.scrapeUrlWorkflow')!;

    const bySourceUrl = handler.idempotencyKey(officialExecution({
      sourceUrl: 'https://detail.1688.com/offer/123.html',
    }) as never);
    const byUrl = handler.idempotencyKey(officialExecution({
      url: ' https://detail.1688.com/offer/123.html ',
    }) as never);

    expect(byUrl).toBe(bySourceUrl);
    expect(byUrl).toContain('00000000-0000-4000-8000-000000000001');
  });

  it('routes direct workflow callers through the generic owner Operation', async () => {
    const registry = { register: vi.fn() } as unknown as AgentCapabilityRegistry;
    const operations = {
      startDirect: vi.fn().mockResolvedValue({ operationRunId: 'operation-direct-1', status: 'queued' }),
      startOfficial: vi.fn(),
    } as unknown as SourcingScrapeOperationPort;
    const adapter = new SourcingScrapeUrlCapabilityAdapter(registry, operations);

    await expect(adapter.scrapeUrlWorkflow({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      sourceUrl: 'https://detail.1688.com/offer/123.html',
    })).resolves.toMatchObject({ taskId: 'operation-direct-1' });

    expect(operations.startDirect).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
    }));
    expect(operations.startOfficial).not.toHaveBeenCalled();
  });
});
