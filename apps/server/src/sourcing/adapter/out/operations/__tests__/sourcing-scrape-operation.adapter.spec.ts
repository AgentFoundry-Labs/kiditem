import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionOwnedOperationPort } from '../../../../../agent-os/application/port/in/session-control/agent-session-owned-operation.port';
import type { OperationRunnerPort } from '../../../../../operations/application/port/in/operation-runner.port';
import { SourcingScrapeOperationAdapter } from '../sourcing-scrape-operation.adapter';

const officialExecution = {
  organization: 'organizations/org-1',
  actor: 'users/user-1',
  agentVersion: 'agentDefinitions/sourcing/versions/1',
  session: 'organizations/org-1/agentSessions/session-1',
  task: 'organizations/org-1/agentSessions/session-1/tasks/task-1',
  execution: 'organizations/org-1/agentSessions/session-1/executions/execution-1',
  attempt: 'organizations/org-1/agentSessions/session-1/executions/execution-1/attempts/attempt-1',
  operation: 'organizations/org-1/operations/operation-1',
  requestId: '00000000-0000-4000-8000-000000000001',
  input: {},
};

describe('SourcingScrapeOperationAdapter', () => {
  it('starts direct HTTP work as the generic sourcing owner Operation', async () => {
    const operations = {
      start: vi.fn().mockResolvedValue({ id: 'operation-direct-1', status: 'queued' }),
    } as unknown as OperationRunnerPort;
    const sessionOperations = { startCapability: vi.fn() } as unknown as AgentSessionOwnedOperationPort;
    const adapter = new SourcingScrapeOperationAdapter(operations, sessionOperations);

    await expect(adapter.startDirect({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      sourceUrl: 'https://detail.1688.com/offer/123.html',
      idempotencyKey: 'direct-key',
    })).resolves.toEqual({ operationRunId: 'operation-direct-1', status: 'queued' });

    expect(operations.start).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: 'sourcing.scrape_url',
      triggerSource: 'domain_screen',
      requestedByUserId: 'user-1',
    }));
    expect(sessionOperations.startCapability).not.toHaveBeenCalled();
  });

  it('starts official capability work only through the exact session ownership port', async () => {
    const operations = { start: vi.fn() } as unknown as OperationRunnerPort;
    const sessionOperations = {
      startCapability: vi.fn().mockResolvedValue({ operationRunId: 'operation-child-1' }),
    } as unknown as AgentSessionOwnedOperationPort;
    const adapter = new SourcingScrapeOperationAdapter(operations, sessionOperations);

    await expect(adapter.startOfficial({
      execution: officialExecution as never,
      sourceUrl: 'https://detail.1688.com/offer/123.html',
    })).resolves.toEqual({ operationRunId: 'operation-child-1', status: 'queued' });

    expect(sessionOperations.startCapability).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      sessionId: 'session-1',
      operationKey: 'sourcing.scrape_url',
      requestedByUserId: 'user-1',
      idempotencyKey: expect.stringContaining('00000000-0000-4000-8000-000000000001'),
    }));
    expect(operations.start).not.toHaveBeenCalled();
  });
});
