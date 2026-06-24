import { describe, expect, it } from 'vitest';
import { SourcingMarketDiscoveryService } from '../sourcing-market-discovery.service';

describe('SourcingMarketDiscoveryService', () => {
  it('builds recommendation packet from stub market and supplier evidence', async () => {
    const service = new SourcingMarketDiscoveryService();
    const result = await service.discover({
      organizationId: 'org-1',
      keyword: '실리콘 식판',
      category: '유아식기',
      mode: 'stub',
    });

    expect(result.marketSignals.length).toBeGreaterThan(0);
    expect(result.coupangMatches.length).toBeGreaterThan(0);
    expect(result.trackingSnapshots.length).toBeGreaterThan(0);
    expect(result.supplierMatches.length).toBeGreaterThan(0);
    expect(result.scoredOpportunities.length).toBeGreaterThan(0);
    expect(result.recommendations[0].artifact.title).toContain('실리콘');
    expect(result.recommendations[0].score.totalScore).toBeGreaterThan(70);
  });
});
