import { describe, expect, it, vi } from 'vitest';
import { SourcingFinalCapabilityAdapter } from './sourcing-final-capability.adapter';
import { SourcingScrapeSnapshotAdmissionGuard } from './sourcing-scrape-snapshot-admission.guard';
import { SOURCING_CAPABILITIES } from '../../../domain/capability/sourcing.capabilities';

const context = {
  organizationId: '00000000-0000-4000-8000-000000000001', initiatingUserId: '00000000-0000-4000-8000-000000000002', attemptId: '00000000-0000-4000-8000-000000000003', ownerIdempotencyKey: 'owner-key',
};

function setup(admissions = { recordScrapeSnapshot: vi.fn() }) {
  const reads = { retrieveWorkspaceEvidence: vi.fn(), inspectRecommendationRun: vi.fn() };
  const mutations = { refreshValidation: vi.fn().mockResolvedValue({ recommendationRunId: '00000000-0000-4000-8000-000000000007', validationEpisodeIds: [], missingEvidence: [] }), createReviewBatch: vi.fn() };
  const discovery = { duplicateCheck: vi.fn().mockResolvedValue({ duplicate: false, candidateId: null }), scrapeProductUrl: vi.fn().mockResolvedValue({ sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688', title: 'Toy', price: 1, currency: 'CNY', images: [], contentHash: 'a'.repeat(64) }), ingestCandidate: vi.fn().mockResolvedValue({ candidateId: '00000000-0000-4000-8000-000000000010' }) };
  const shadow = { collectShadowSignals: vi.fn() };
  const operations = { start: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000008', status: 'queued' }) };
  return { adapter: new SourcingFinalCapabilityAdapter(reads as never, mutations as never, discovery as never, shadow as never, operations as never, admissions as never), reads, mutations, discovery, operations };
}

describe('SourcingFinalCapabilityAdapter', () => {
  it('rejects a missing owner idempotency key before contacting a mutation owner', async () => {
    const { adapter, mutations, discovery, operations } = setup();
    const withoutKey = { ...context, ownerIdempotencyKey: undefined };
    await expect(adapter.ingestCandidate({ context: withoutKey as never, input: { snapshot: {
      sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688', title: 'Toy', price: 1, currency: 'CNY', images: [], contentHash: 'a'.repeat(64),
    } } })).rejects.toThrow('owner_idempotency_key_required');
    await expect(adapter.refreshValidation({ context: withoutKey as never, input: { recommendationRunId: '00000000-0000-4000-8000-000000000007' } })).rejects.toThrow('owner_idempotency_key_required');
    await expect(adapter.scrapeUrlWorkflow({ context: withoutKey as never, input: { sourceUrl: 'https://detail.1688.com/offer/1.html' } })).rejects.toThrow('owner_idempotency_key_required');
    expect(mutations.refreshValidation).not.toHaveBeenCalled();
    expect(discovery.ingestCandidate).not.toHaveBeenCalled();
    expect(discovery.duplicateCheck).not.toHaveBeenCalled();
    expect(operations.start).not.toHaveBeenCalled();
  });

  it('executes an already-admitted ingest after pre-admission process state is unavailable', async () => {
    const admission = new SourcingScrapeSnapshotAdmissionGuard();
    const { adapter, discovery } = setup();
    const snapshot = {
      sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688' as const, title: 'Toy', price: 1, currency: 'CNY', images: [], contentHash: 'a'.repeat(64),
    };
    admission.recordScrapeSnapshot({ ...context, snapshot });
    await admission.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } });
    await expect(adapter.ingestCandidate({ context, input: { snapshot } })).resolves.toEqual({ candidateId: '00000000-0000-4000-8000-000000000010' });
    expect(discovery.ingestCandidate).toHaveBeenCalledOnce();
  });

  it('replays an ingest for the same owner key and canonical snapshot, and rejects drift', async () => {
    const { adapter, discovery } = setup();
    const snapshot = {
      sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688' as const, title: 'Toy', price: 1, currency: 'CNY', images: [], contentHash: 'a'.repeat(64),
    };

    const first = await adapter.ingestCandidate({ context, input: { snapshot } });
    await expect(adapter.ingestCandidate({ context, input: { snapshot: { ...snapshot } } }))
      .resolves.toEqual(first);
    await expect(adapter.ingestCandidate({
      context,
      input: { snapshot: { ...snapshot, title: 'Changed' } },
    })).rejects.toThrow('owner_idempotency_input_conflict');
    expect(discovery.ingestCandidate).toHaveBeenCalledOnce();
  });

  it('uses the exact owner key for both workflow Operation and synchronous validation owner', async () => {
    const { adapter, operations, mutations } = setup();
    await adapter.scrapeUrlWorkflow({ context, input: { sourceUrl: 'https://detail.1688.com/offer/1.html' } });
    await adapter.refreshValidation({ context, input: { recommendationRunId: '00000000-0000-4000-8000-000000000007' } });
    expect(operations.start).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: 'sourcing.scrape_url',
      triggerSource: 'agent',
      idempotencyKey: 'owner-key',
    }));
    expect(mutations.refreshValidation).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'owner-key' }));
  });

  it('replays a validation request for the same key and rejects canonical-input drift', async () => {
    const { adapter, mutations } = setup();
    const request = { context, input: { recommendationRunId: '00000000-0000-4000-8000-000000000007' } };
    await adapter.refreshValidation(request);
    await adapter.refreshValidation(request);
    await expect(adapter.refreshValidation({ context, input: { recommendationRunId: '00000000-0000-4000-8000-000000000008' } })).rejects.toThrow('owner_idempotency_input_conflict');
    expect(mutations.refreshValidation).toHaveBeenCalledOnce();
  });

  it('returns an existing candidate without creating an Operation', async () => {
    const { adapter, discovery, operations } = setup();
    discovery.duplicateCheck.mockResolvedValue({
      duplicate: true,
      candidateId: '00000000-0000-4000-8000-000000000010',
    });

    await expect(adapter.scrapeUrlWorkflow({
      context,
      input: { sourceUrl: 'https://detail.1688.com/offer/1.html' },
    })).resolves.toEqual({
      kind: 'existing',
      candidateId: '00000000-0000-4000-8000-000000000010',
    });
    expect(operations.start).not.toHaveBeenCalled();
  });

  it('replays an existing-candidate workflow result and rejects owner-key drift', async () => {
    const { adapter, discovery, operations } = setup();
    discovery.duplicateCheck.mockResolvedValue({
      duplicate: true,
      candidateId: '00000000-0000-4000-8000-000000000010',
    });

    const request = {
      context,
      input: { sourceUrl: 'https://detail.1688.com/offer/1.html' },
    };
    const first = await adapter.scrapeUrlWorkflow(request);
    await expect(adapter.scrapeUrlWorkflow(request)).resolves.toEqual(first);
    await expect(adapter.scrapeUrlWorkflow({
      context,
      input: { sourceUrl: 'https://detail.1688.com/offer/2.html' },
    })).rejects.toThrow('owner_idempotency_input_conflict');
    expect(discovery.duplicateCheck).toHaveBeenCalledOnce();
    expect(operations.start).not.toHaveBeenCalled();
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
      context: { organizationId: context.organizationId },
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
