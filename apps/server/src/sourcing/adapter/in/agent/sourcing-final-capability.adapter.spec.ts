import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { SOURCING_CAPABILITIES } from '../../../domain/capability/sourcing.capabilities';
import { SourcingFinalCapabilityAdapter } from './sourcing-final-capability.adapter';
import { SourcingScrapeSnapshotAdmissionGuard } from './sourcing-scrape-snapshot-admission.guard';

const baseContext = {
  organizationId: '00000000-0000-4000-8000-000000000001', initiatingUserId: '00000000-0000-4000-8000-000000000002', executionId: 'execution-1',
};

function mutationContext(_capabilityKey: string, input: unknown) {
  return {
    ...baseContext,
    ownerIdempotencyKey: 'capability-invocation:00000000-0000-4000-8000-000000000099',
    ownerInputHash: canonicalOwnerInputHash(input),
  };
}

function setup(admissions = { recordScrapeSnapshot: vi.fn() }) {
  const reads = { retrieveWorkspaceEvidence: vi.fn(), inspectRecommendationRun: vi.fn() };
  const mutations = { refreshValidation: vi.fn().mockResolvedValue({ recommendationRunId: '00000000-0000-4000-8000-000000000007', validationEpisodeIds: [], missingEvidence: [] }), createReviewBatch: vi.fn() };
  const discovery = { duplicateCheck: vi.fn().mockResolvedValue({ duplicate: false, candidateId: null }), scrapeProductUrl: vi.fn().mockResolvedValue({ sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688', title: 'Toy', price: 1, currency: 'CNY', variantKeyNormalized: '', images: [], contentHash: 'a'.repeat(64) }), ingestCandidate: vi.fn().mockResolvedValue({ candidateId: '00000000-0000-4000-8000-000000000010' }) };
  const shadow = { collectShadowSignals: vi.fn().mockResolvedValue({ operationRunId: '00000000-0000-4000-8000-000000000009', status: 'queued' }) };
  const operations = {
    findByIdempotency: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000008', status: 'queued' }),
  };
  const trends = { collect: vi.fn().mockResolvedValue({ businessDate: '2026-09-06', results: [] }) };
  return { trends, adapter: new SourcingFinalCapabilityAdapter(reads as never, mutations as never, discovery as never, shadow as never, operations as never, admissions as never, trends as never), reads, mutations, discovery, shadow, operations };
}

function workflowAdapter(operations: {
  findByIdempotency: (input: {
    organizationId: string;
    operationKey: string;
    idempotencyKey: string;
    expectedInput?: Record<string, unknown>;
  }) => Promise<{ id: string; status: string } | null>;
  start: (input: {
    organizationId: string;
    operationKey: string;
    triggerSource: string;
    input: Record<string, unknown>;
    requestedByUserId: string;
    idempotencyKey: string;
  }) => Promise<{ id: string; status: string }>;
}) {
  return new SourcingFinalCapabilityAdapter(
    { retrieveWorkspaceEvidence: vi.fn(), inspectRecommendationRun: vi.fn() } as never,
    { refreshValidation: vi.fn(), createReviewBatch: vi.fn() } as never,
    {
      duplicateCheck: vi.fn().mockResolvedValue({ duplicate: false, candidateId: null }),
      scrapeProductUrl: vi.fn(),
      ingestCandidate: vi.fn(),
    } as never,
    { collectShadowSignals: vi.fn() } as never,
    operations as never,
    { recordScrapeSnapshot: vi.fn() } as never,
  );
}

describe('SourcingFinalCapabilityAdapter', () => {
  it('rejects a missing owner idempotency key before contacting a mutation owner', async () => {
    const { adapter, mutations, discovery, operations } = setup();
    const withoutKey = { ...baseContext, ownerIdempotencyKey: undefined };
    await expect(adapter.ingestCandidate({ context: withoutKey as never, input: { snapshot: {
      sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688', title: 'Toy', price: 1, currency: 'CNY', variantKeyNormalized: '', images: [], contentHash: 'a'.repeat(64),
    } } })).rejects.toThrow('owner_idempotency_key_required');
    await expect(adapter.refreshValidation({ context: withoutKey as never, input: { recommendationRunId: '00000000-0000-4000-8000-000000000007' } })).rejects.toThrow('owner_idempotency_key_required');
    await expect(adapter.scrapeUrlWorkflow({ context: withoutKey as never, input: { sourceUrl: 'https://detail.1688.com/offer/1.html' } })).rejects.toThrow('owner_idempotency_key_required');
    expect(mutations.refreshValidation).not.toHaveBeenCalled();
    expect(discovery.ingestCandidate).not.toHaveBeenCalled();
    expect(discovery.duplicateCheck).not.toHaveBeenCalled();
    expect(operations.start).not.toHaveBeenCalled();
  });

  it('rejects changed ingest input with the original owner key across fresh adapters', async () => {
    const first = setup();
    const second = setup();
    const snapshot = {
      sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688' as const, title: 'Toy', price: 1, currency: 'CNY', variantKeyNormalized: '', images: [], contentHash: 'a'.repeat(64),
    };
    const context = mutationContext('sourcing.ingestCandidate', { snapshot });
    await first.adapter.ingestCandidate({ context, input: { snapshot } });
    await expect(second.adapter.ingestCandidate({
      context,
      input: { snapshot: { ...snapshot, title: 'Changed' } },
    })).rejects.toThrow('owner_idempotency_input_conflict');
    expect(second.discovery.ingestCandidate).not.toHaveBeenCalled();
  });

  it('rejects validation and workflow drift before reaching fresh owner adapters', async () => {
    const validation = setup();
    const workflow = setup();
    const validationInput = { recommendationRunId: '00000000-0000-4000-8000-000000000007' };
    const workflowInput = { sourceUrl: 'https://detail.1688.com/offer/1.html' };

    await expect(validation.adapter.refreshValidation({
      context: mutationContext('sourcing.refreshValidation', validationInput),
      input: { recommendationRunId: '00000000-0000-4000-8000-000000000008' },
    })).rejects.toThrow('owner_idempotency_input_conflict');
    await expect(workflow.adapter.scrapeUrlWorkflow({
      context: mutationContext('sourcing.scrapeUrlWorkflow', workflowInput),
      input: { sourceUrl: 'https://detail.1688.com/offer/2.html' },
    })).rejects.toThrow('owner_idempotency_input_conflict');
    expect(validation.mutations.refreshValidation).not.toHaveBeenCalled();
    expect(workflow.discovery.duplicateCheck).not.toHaveBeenCalled();
  });

  it('replays a committed workflow after a lost owner response through a fresh adapter and fences owner-key input drift', async () => {
    const run = {
      id: '00000000-0000-4000-8000-000000000008',
      status: 'queued',
      input: { sourceUrl: 'https://detail.1688.com/offer/1.html' },
    };
    let committed = false;
    let loseFirstResponse = true;
    const operations = {
      findByIdempotency: vi.fn(async (request: {
        organizationId: string;
        operationKey: string;
        idempotencyKey: string;
        expectedInput?: Record<string, unknown>;
      }) => {
        if (!committed) return null;
        if (request.expectedInput === undefined || JSON.stringify(request.expectedInput) !== JSON.stringify(run.input)) {
          throw new Error('idempotency_key_input_conflict');
        }
        return { id: run.id, status: run.status };
      }),
      start: vi.fn(async (request: {
        organizationId: string;
        operationKey: string;
        triggerSource: string;
        input: Record<string, unknown>;
        requestedByUserId: string;
        idempotencyKey: string;
      }) => {
        expect(request.input).toEqual(run.input);
        committed = true;
        if (loseFirstResponse) {
          loseFirstResponse = false;
          throw new Error('owner_response_lost_after_operation_commit');
        }
        return { id: run.id, status: run.status };
      }),
    };
    const input = run.input;
    const context = mutationContext('sourcing.scrapeUrlWorkflow', input);

    await expect(workflowAdapter(operations).scrapeUrlWorkflow({ context, input }))
      .rejects.toThrow('owner_response_lost_after_operation_commit');

    await expect(workflowAdapter(operations).scrapeUrlWorkflow({ context, input }))
      .resolves.toEqual({ kind: 'enqueued', operationRunId: run.id, status: run.status });

    const changedInput = { sourceUrl: 'https://detail.1688.com/offer/2.html' };
    await expect(workflowAdapter(operations).scrapeUrlWorkflow({
      context: {
        ...context,
        ownerInputHash: canonicalOwnerInputHash(changedInput),
      },
      input: changedInput,
    })).rejects.toThrow('idempotency_key_input_conflict');

    expect(operations.start).toHaveBeenCalledTimes(1);
    expect(operations.findByIdempotency).toHaveBeenCalledTimes(3);
  });

  it('does not accept an arbitrary owner key for an exact ingest input', async () => {
    const { adapter, discovery } = setup();
    const snapshot = {
      sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688' as const, title: 'Toy', price: 1, currency: 'CNY', variantKeyNormalized: '', images: [], contentHash: 'a'.repeat(64),
    };
    await expect(adapter.ingestCandidate({
      context: { ...baseContext, ownerIdempotencyKey: 'fabricated-key' },
      input: { snapshot },
    })).rejects.toThrow('owner_idempotency_input_conflict');
    expect(discovery.ingestCandidate).not.toHaveBeenCalled();
  });

  it('passes the exact owner key to the final candidate owner after invocation admission', async () => {
    const admission = new SourcingScrapeSnapshotAdmissionGuard();
    const { adapter, discovery } = setup();
    const snapshot = {
      sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688' as const, title: 'Toy', price: 1, currency: 'CNY', variantKeyNormalized: '', images: [], contentHash: 'a'.repeat(64),
    };
    const context = mutationContext('sourcing.ingestCandidate', { snapshot });
    admission.recordScrapeSnapshot({ ...context, snapshot });
    await admission.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } });
    await expect(adapter.ingestCandidate({ context, input: { snapshot } })).resolves.toEqual({ candidateId: '00000000-0000-4000-8000-000000000010' });
    expect(discovery.ingestCandidate).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: context.ownerIdempotencyKey,
      snapshot,
    }));
  });

  it('does not retain ingest replay state in an adapter instance', async () => {
    const { adapter, discovery } = setup();
    const snapshot = {
      sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688' as const, title: 'Toy', price: 1, currency: 'CNY', variantKeyNormalized: '', images: [], contentHash: 'a'.repeat(64),
    };
    const context = mutationContext('sourcing.ingestCandidate', { snapshot });

    await adapter.ingestCandidate({ context, input: { snapshot } });
    await adapter.ingestCandidate({ context, input: { snapshot: { ...snapshot } } });
    expect(discovery.ingestCandidate).toHaveBeenCalledTimes(2);
  });

  it('uses the exact owner key for both workflow Operation and synchronous validation owner', async () => {
    const { adapter, operations, mutations } = setup();
    const workflowInput = { sourceUrl: 'https://detail.1688.com/offer/1.html' };
    const validationInput = { recommendationRunId: '00000000-0000-4000-8000-000000000007' };
    const workflowContext = mutationContext('sourcing.scrapeUrlWorkflow', workflowInput);
    const validationContext = mutationContext('sourcing.refreshValidation', validationInput);
    await adapter.scrapeUrlWorkflow({ context: workflowContext, input: workflowInput });
    await adapter.refreshValidation({ context: validationContext, input: validationInput });
    expect(operations.start).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: 'sourcing.scrape_url',
      triggerSource: 'agent',
      idempotencyKey: workflowContext.ownerIdempotencyKey,
    }));
    expect(mutations.refreshValidation).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: validationContext.ownerIdempotencyKey, requestHash: validationContext.ownerInputHash }));
  });

  it('passes exact derived owner keys to collection, review, and shadow owners', async () => {
    const { adapter, mutations, shadow, operations, trends } = setup();
    const collectionInput = { sources: ['1688'] as Array<'naver' | '1688' | 'shorts'> };
    const reviewInput = {
      recommendationRunId: '00000000-0000-4000-8000-000000000007',
      workspaceKey: 'entry' as const,
      items: [{ itemKey: 'offer-1', expectedVersion: 1 }],
    };
    const shadowInput = {} as Record<string, never>;
    const collectionContext = mutationContext('sourcing.refreshCollection', collectionInput);
    const reviewContext = mutationContext('sourcing.createReviewBatch', reviewInput);
    const shadowContext = mutationContext('sourcing.collect_shadow_signals', shadowInput);

    await adapter.refreshCollection({ context: collectionContext, input: collectionInput });
    await adapter.createReviewBatch({ context: reviewContext, input: reviewInput });
    await adapter.collectShadowSignals({ context: shadowContext, input: shadowInput });

    expect(trends.collect).toHaveBeenCalledWith(baseContext.organizationId, collectionInput.sources, baseContext.initiatingUserId, collectionContext.ownerIdempotencyKey);
    expect(operations.start).not.toHaveBeenCalled();
    expect(mutations.createReviewBatch).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: reviewContext.ownerIdempotencyKey,
    }));
    expect(shadow.collectShadowSignals).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: shadowContext.ownerIdempotencyKey,
    }));
  });

  it('delegates validation replay to its durable Sourcing owner across adapter instances', async () => {
    const { adapter, mutations } = setup();
    const input = { recommendationRunId: '00000000-0000-4000-8000-000000000007' };
    const request = { context: mutationContext('sourcing.refreshValidation', input), input };
    await adapter.refreshValidation(request);
    await adapter.refreshValidation(request);
    expect(mutations.refreshValidation).toHaveBeenCalledTimes(2);
    expect(mutations.refreshValidation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      idempotencyKey: request.context.ownerIdempotencyKey,
    }));
  });

  it('returns an existing candidate without creating an Operation', async () => {
    const { adapter, discovery, operations } = setup();
    const input = { sourceUrl: 'https://detail.1688.com/offer/1.html' };
    discovery.duplicateCheck.mockResolvedValue({
      duplicate: true,
      candidateId: '00000000-0000-4000-8000-000000000010',
    });

    await expect(adapter.scrapeUrlWorkflow({
      context: mutationContext('sourcing.scrapeUrlWorkflow', input),
      input,
    })).resolves.toEqual({
      kind: 'existing',
      candidateId: '00000000-0000-4000-8000-000000000010',
    });
    expect(operations.start).not.toHaveBeenCalled();
  });

  it('delegates workflow replay to the durable Operation owner across adapter instances', async () => {
    const { adapter, discovery, operations } = setup();
    const input = { sourceUrl: 'https://detail.1688.com/offer/1.html' };
    discovery.duplicateCheck.mockResolvedValue({
      duplicate: true,
      candidateId: '00000000-0000-4000-8000-000000000010',
    });

    const request = { context: mutationContext('sourcing.scrapeUrlWorkflow', input), input };
    await adapter.scrapeUrlWorkflow(request);
    await adapter.scrapeUrlWorkflow(request);
    expect(discovery.duplicateCheck).toHaveBeenCalledTimes(2);
    expect(operations.start).not.toHaveBeenCalled();
  });

  it('resolves an exact workflow Operation replay before mutable candidate duplicate detection', async () => {
    const { adapter, discovery, operations } = setup();
    const input = { sourceUrl: 'https://detail.1688.com/offer/1.html' };
    const context = mutationContext('sourcing.scrapeUrlWorkflow', input);
    operations.findByIdempotency.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000099',
      status: 'succeeded',
    });
    discovery.duplicateCheck.mockResolvedValue({
      duplicate: true,
      candidateId: '00000000-0000-4000-8000-000000000010',
    });

    await expect(adapter.scrapeUrlWorkflow({ context, input })).resolves.toEqual({
      kind: 'enqueued',
      operationRunId: '00000000-0000-4000-8000-000000000099',
      status: 'succeeded',
    });
    expect(operations.findByIdempotency).toHaveBeenCalledWith({
      organizationId: context.organizationId,
      operationKey: 'sourcing.scrape_url',
      idempotencyKey: context.ownerIdempotencyKey,
      expectedInput: input,
    });
    expect(discovery.duplicateCheck).not.toHaveBeenCalled();
    expect(operations.start).not.toHaveBeenCalled();
  });

  it('contains no process-memory mutation admission maps', () => {
    const source = readFileSync(
      new URL('./sourcing-final-capability.adapter.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('ingestAdmissions');
    expect(source).not.toContain('validationAdmissions');
    expect(source).not.toContain('workflowAdmissions');
  });

  it('returns bounded evidence documents using the domain date format', async () => {
    const { adapter, reads } = setup();
    reads.retrieveWorkspaceEvidence.mockResolvedValue({
      inputHash: 'b'.repeat(64),
      documentCount: 13,
      documents: Array.from({ length: 13 }, (_, index) => ({
        documentId: `document-${index}`,
        title: ` ${'t'.repeat(510)} `,
        text: ` ${'x'.repeat(8_100)} `,
        sourceScope: 'recommendation_run' as const,
        sourceDate: '2026-08-23',
        sourceSnapshotId: `snapshot-${index}`,
        matchedTerms: [],
        score: 1,
        metadata: {},
      })),
      dataGaps: Array.from({ length: 21 }, () => 'g'.repeat(210)),
    });

    const output = await adapter.retrieveWorkspaceEvidence({
      context: { organizationId: baseContext.organizationId },
      input: { query: 'toy' },
    });
    const definition = SOURCING_CAPABILITIES.find(
      (capability) => capability.key === 'sourcing.retrieveWorkspaceEvidence',
    )!;

    expect(output.documents).toHaveLength(12);
    expect(output.documents[0]).toMatchObject({
      title: expect.stringMatching(/^t{500}$/),
      text: expect.stringMatching(/^x{8000}$/),
      sourceDate: '2026-08-23',
    });
    expect(output.dataGaps).toHaveLength(20);
    expect(definition.outputSchema.safeParse(output).success).toBe(true);
  });
});
