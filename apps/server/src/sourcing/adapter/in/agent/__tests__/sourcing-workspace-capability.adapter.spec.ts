import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityHandler } from '../../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { officialCapabilityExecution } from '../../../../../agent-os/test-helpers/official-capability-execution';
import { SourcingWorkspaceCapabilityAdapter } from '../sourcing-workspace-capability.adapter';

describe('SourcingWorkspaceCapabilityAdapter', () => {
  it('registers only the bounded Sourcing workspace surface', () => {
    const registry = { register: vi.fn() };
    const adapter = new SourcingWorkspaceCapabilityAdapter(
      registry as never,
      workspace() as never,
    );

    adapter.onModuleInit();

    expect(registry.register.mock.calls.map(([handler]) => handler.key)).toEqual([
      'sourcing.retrieveWorkspaceEvidence',
      'sourcing.inspectRecommendationRun',
      'sourcing.refreshValidation',
      'sourcing.createReviewBatch',
    ]);
  });

  it('returns one evidence artifact per normalized document', async () => {
    const handlers: AgentCapabilityHandler[] = [];
    const registry = {
      register: vi.fn((handler: AgentCapabilityHandler) => handlers.push(handler)),
    };
    const capability = workspace();
    capability.retrieveWorkspaceEvidence.mockResolvedValue({
      inputHash: 'a'.repeat(64),
      documentCount: 1,
      documents: [{
        documentId: 'doc-1',
        title: '실리콘 식판',
        text: '추천 근거',
        sourceScope: 'recommendation_run',
        sourceDate: '2026-08-10',
        sourceSnapshotId: 'recommendation-run:run-1',
        matchedTerms: ['실리콘'],
        score: 10,
        metadata: {},
      }],
      dataGaps: [],
    });
    const adapter = new SourcingWorkspaceCapabilityAdapter(
      registry as never,
      capability as never,
    );
    adapter.onModuleInit();

    const evidence = handlers.find(
      (handler) => handler.key === 'sourcing.retrieveWorkspaceEvidence',
    )!;
    const result = await evidence.execute(
      officialCapabilityExecution({ query: '실리콘 식판' }) as never,
    );

    expect(result.outputSummary).toEqual({
      inputHash: 'a'.repeat(64),
      documentCount: 1,
      citationIds: ['doc-1'],
      dataGaps: [],
    });
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        artifactType: 'sourcing_evidence_document',
        targetId: 'doc-1',
      }),
    ]);
    expect(() => evidence.inputSchema.parse({
      query: '실리콘 식판',
      organizationId: 'forged-org',
    })).toThrow();
  });
});

function workspace() {
  return {
    retrieveWorkspaceEvidence: vi.fn(),
    inspectRecommendationRun: vi.fn(),
    refreshValidation: vi.fn(),
    createReviewBatch: vi.fn(),
  };
}
