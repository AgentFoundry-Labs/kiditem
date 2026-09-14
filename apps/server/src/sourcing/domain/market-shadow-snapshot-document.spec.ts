import { describe, expect, it } from 'vitest';
import { MarketShadowSnapshotDocumentSchema } from './market-shadow-snapshot-document';

describe('MarketShadowSnapshotDocumentSchema', () => {
  it('keeps only the explicit source facts and strips provider raw objects', () => {
    const document = MarketShadowSnapshotDocumentSchema.parse({
      version: 1,
      input: {
        experiment: 'paired-shadow-v1',
        sources: ['google-trends-rss'],
        seedKeywords: ['문구'],
        windowDays: 30,
      },
      result: {
        status: 'complete',
        decisionImpact: 'disabled',
        sources: [{
          source: 'google-trends-rss',
          generatedAt: '2026-09-13T00:00:00.000Z',
          items: [{
            externalId: 'trend-1',
            source: 'google-trends-rss',
            title: '문구',
            rawTitle: '문구',
            approximateTraffic: null,
            approximateTrafficLabel: null,
            publishedAt: null,
            sourceUrl: null,
            newsItems: [],
            relevanceLabel: '문구',
            raw: { arbitrary: 'provider-private' },
          }],
        }],
        evaluation: {
          baseline: {
            naverKeywordCount: 0,
            naverPopularKeywordCount: 0,
            hot1688Count: 0,
            shortsCount: 0,
            evidenceGroupCount: 0,
            relevanceLabels: [],
          },
          googleTrends: {
            signalCount: 1,
            relevantSignalCount: 1,
            relevanceRate: 1,
            relevanceLabels: ['문구'],
            overlapLabels: [],
            novelLabels: ['문구'],
          },
          linkfoxEchoTik: {
            status: 'disabled',
            region: null,
            productCount: 0,
            relevantProductCount: 0,
            freshProductCount: 0,
            evidenceCompleteness: 0,
            costPoints: null,
            relevanceLabels: [],
          },
          pairedComparison: {
            controlEvidenceGroupCount: 0,
            treatmentProductCount: 0,
            overlapCount: 0,
            novelRelevantCount: 0,
            freshCount: 0,
            evidenceCompleteness: 0,
            costPoints: null,
          },
          promotionGate: {
            minimumObservationDays: 30,
            observedDays: 1,
            reviewReady: false,
            eligible: false,
          },
        },
        errors: [],
      },
      meta: {
        generatedAt: '2026-09-13T00:00:00.000Z',
        generationSource: 'scheduled',
        generatorVersion: 'market-shadow-signals.v1',
      },
    });

    const source = document.result.sources[0];
    expect(source?.source).toBe('google-trends-rss');
    if (source?.source !== 'google-trends-rss') throw new Error('expected Google source');
    expect(source.items[0]).not.toHaveProperty('raw');
  });
});
