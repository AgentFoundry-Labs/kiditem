import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityHandler } from '../../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { officialCapabilityExecution } from '../../../../../agent-os/test-helpers/official-capability-execution';
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
      startOfficial: vi.fn().mockResolvedValue({
        operation:
          `organizations/${ORG_ID}/operations/b7c099b4-cf56-47ae-a553-23e65e5f263f`,
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
      handler.idempotencyKey(officialCapabilityExecution(
        { sources: ['naver', '1688'] },
        { organizationId: ORG_ID, actor: 'users/user-1', requestId: REQUEST_ID },
      ) as never),
    ).toBe(
      `${REQUEST_ID}:sourcing.refreshCollection:1688,naver`,
    );

    const result = await handler.execute(officialCapabilityExecution(
      { sources: ['naver', '1688', 'naver'] },
      { organizationId: ORG_ID, actor: 'users/user-1', requestId: REQUEST_ID },
    ) as never);

    expect(collections.startOfficial).toHaveBeenCalledWith({
      execution: expect.objectContaining({
        organization: `organizations/${ORG_ID}`,
        requestId: REQUEST_ID,
      }),
      sources: ['1688', 'naver'],
    });
    expect(result).toEqual({
      resourceType: 'operation_run',
      resourceId:
        `organizations/${ORG_ID}/operations/b7c099b4-cf56-47ae-a553-23e65e5f263f`,
      outputSummary: {
        operation:
          `organizations/${ORG_ID}/operations/b7c099b4-cf56-47ae-a553-23e65e5f263f`,
        status: 'queued',
      },
      artifacts: [
        {
          artifactType: 'operation_run',
          targetDomain: 'operations',
          targetModel: 'OperationRun',
          targetId:
            `organizations/${ORG_ID}/operations/b7c099b4-cf56-47ae-a553-23e65e5f263f`,
          title: '소싱 수집 실행',
          summary: {
            operation:
              `organizations/${ORG_ID}/operations/b7c099b4-cf56-47ae-a553-23e65e5f263f`,
            status: 'queued',
            sources: ['1688', 'naver'],
          },
        },
      ],
    });
    expect(handler.outputSchema.parse(result.outputSummary)).toEqual(
      result.outputSummary,
    );
    expect(() =>
      handler.outputSchema.parse({
        operationRunId: result.resourceId,
        status: 'queued',
      }),
    ).toThrow();
  });

  it('uses its persisted official request context for the mutating handler', async () => {
    const handlers: AgentCapabilityHandler[] = [];
    const adapter = new SourcingCollectionCapabilityAdapter(
      { register: (handler: AgentCapabilityHandler) => handlers.push(handler) } as never,
      {
        startOfficial: vi.fn().mockResolvedValue({
          operation:
            `organizations/${ORG_ID}/operations/b7c099b4-cf56-47ae-a553-23e65e5f263f`,
          status: 'queued',
        }),
      } as never,
    );
    adapter.onModuleInit();

    await expect(handlers[0]!.execute(officialCapabilityExecution(
      { sources: ['naver'] },
      { organizationId: ORG_ID, actor: null, requestId: REQUEST_ID },
    ) as never)).resolves.toBeDefined();
  });
});
