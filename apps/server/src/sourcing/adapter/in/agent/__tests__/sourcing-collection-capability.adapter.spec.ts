import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityHandler } from '../../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { SourcingCollectionCapabilityAdapter } from '../sourcing-collection-capability.adapter';

const ORG_ID = 'df3b198e-5b31-4f86-b054-bbf4852536a5';
const REQUEST_ID = 'b282952f-d786-4c91-b59d-835d48351697';

describe('SourcingCollectionCapabilityAdapter', () => {
  it('preserves the refreshCollection schema, policy, sorted idempotency, and operation artifact', async () => {
    const handlers: AgentCapabilityHandler[] = [];
    const registry = {
      register: vi.fn((handler: AgentCapabilityHandler) => handlers.push(handler)),
    };
    const collections = {
      startCollection: vi.fn().mockResolvedValue({
        operationRunId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
        status: 'queued',
      }),
    };
    const adapter = new SourcingCollectionCapabilityAdapter(
      registry as never,
      collections as never,
    );

    adapter.onModuleInit();

    expect(handlers.map((handler) => handler.key)).toEqual([
      'sourcing.refreshCollection',
    ]);
    const handler = handlers[0]!;
    expect(handler.sideEffects).toEqual([
      'db_write',
      'external_io',
      'job_enqueue',
    ]);
    expect(handler.approvalRisk).toBe('low');
    expect(() =>
      handler.inputSchema.parse({
        sources: ['naver'],
        organizationId: 'forged',
      }),
    ).toThrow();
    expect(
      handler.idempotencyKey({
        organizationId: ORG_ID,
        agentInstanceId: 'agent-1',
        agentType: 'sourcing',
        requestId: REQUEST_ID,
        runId: 'run-1',
        requestedByUserId: 'user-1',
        input: { sources: ['naver', '1688'] },
      }),
    ).toBe(
      `${ORG_ID}:${REQUEST_ID}:sourcing.refreshCollection:1688,naver`,
    );

    const result = await handler.execute({
      organizationId: ORG_ID,
      agentInstanceId: 'agent-1',
      agentType: 'sourcing',
      requestId: REQUEST_ID,
      runId: 'run-1',
      requestedByUserId: 'user-1',
      input: { sources: ['naver', '1688', 'naver'] },
    });

    expect(collections.startCollection).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      requestedByUserId: 'user-1',
      sources: ['1688', 'naver'],
      idempotencyKey: `${ORG_ID}:${REQUEST_ID}:sourcing.refreshCollection:1688,naver,naver`,
    });
    expect(result).toEqual({
      resourceType: 'operation_run',
      resourceId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
      outputSummary: {
        operationRunId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
        status: 'queued',
      },
      artifacts: [
        {
          artifactType: 'operation_run',
          targetDomain: 'operations',
          targetModel: 'OperationRun',
          targetId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
          title: '소싱 수집 실행',
          summary: {
            operationRunId: 'b7c099b4-cf56-47ae-a553-23e65e5f263f',
            status: 'queued',
            sources: ['1688', 'naver'],
          },
        },
      ],
    });
  });

  it('requires persisted Agent request context for the mutating handler', async () => {
    const handlers: AgentCapabilityHandler[] = [];
    const adapter = new SourcingCollectionCapabilityAdapter(
      { register: (handler: AgentCapabilityHandler) => handlers.push(handler) } as never,
      { startCollection: vi.fn() } as never,
    );
    adapter.onModuleInit();

    await expect(
      handlers[0]!.execute({
        organizationId: ORG_ID,
        agentInstanceId: 'agent-1',
        agentType: 'sourcing',
        requestId: null,
        runId: null,
        requestedByUserId: null,
        input: { sources: ['naver'] },
      }),
    ).rejects.toMatchObject({ code: 'agent_request_context_required' });
  });
});
