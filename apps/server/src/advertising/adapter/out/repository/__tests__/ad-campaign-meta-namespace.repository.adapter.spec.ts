import { describe, expect, it, vi } from 'vitest';
import { AdCampaignRepositoryAdapter } from '../ad-campaign.repository.adapter';

describe('AdCampaignRepositoryAdapter target metadata namespace', () => {
  it('reads grain and conversion evidence from repository-persisted namespaces', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const adapter = new AdCampaignRepositoryAdapter({
      $queryRaw: queryRaw,
    } as never);

    await adapter.findCampaignRollups(
      '00000000-0000-4000-8000-000000000001',
      '7d',
    );

    const sql = queryRaw.mock.calls[0][0].strings.join(' ');
    expect(sql).toContain(
      "meta_json -> 'advertising.campaign.target' ->> 'granularity'",
    );
    expect(sql).toContain(
      "meta_json -> 'advertising.raw.target' ->> 'granularity'",
    );
    expect(sql).toContain(
      "meta_json -> 'advertising.campaign.target' ->> 'conversionsObserved'",
    );
    expect(sql).toContain(
      "meta_json -> 'advertising.raw.target' ->> 'conversionsObserved'",
    );
    expect(sql).toContain("meta_json -> 'data' ->> 'granularity'");
  });
});
