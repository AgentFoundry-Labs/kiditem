import { describe, expect, it } from 'vitest';
import { matchedSourcingAgentRagTerms } from '../sourcing-agent-rag';

describe('matchedSourcingAgentRagTerms', () => {
  it('reports the same normalized terms used by deterministic RAG scoring', () => {
    expect(matchedSourcingAgentRagTerms({
      id: 'doc-1',
      sourceScope: 'recommendation_run',
      sourceSnapshotId: 'recommendation-run:run-1',
      sourceDate: '2026-08-10',
      kind: 'recommendation',
      title: '실리콘 이유식 식판',
      text: '쿠팡 추천 후보',
      tags: ['유아식기'],
      metadata: {},
    }, '실리콘 식판 알려줘')).toEqual(expect.arrayContaining(['실리콘', '식판']));
  });
});
