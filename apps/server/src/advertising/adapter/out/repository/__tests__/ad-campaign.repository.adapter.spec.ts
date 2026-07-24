import { describe, expect, it, vi } from 'vitest';
import { AdCampaignRepositoryAdapter } from '../ad-campaign.repository.adapter';

describe('AdCampaignRepositoryAdapter campaign identity grain', () => {
  it('deduplicates and groups campaign facts by account + stable identity, never display name', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        targetKey: 'account-a:campaign:same-id',
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        campaignIdentity: 'campaign:same-id',
        campaignId: 'same-id',
        campaignName: '같은 이름',
      },
      {
        targetKey: 'account-b:campaign:same-id',
        channelAccountId: '22222222-2222-4222-8222-222222222222',
        campaignIdentity: 'campaign:same-id',
        campaignId: 'same-id',
        campaignName: '같은 이름',
      },
    ]);
    const adapter = new AdCampaignRepositoryAdapter({ $queryRaw: queryRaw } as never);

    const rows = await adapter.findCampaignRollups(
      '00000000-0000-4000-8000-000000000001',
      '7d',
    );

    expect(rows).toHaveLength(2);
    const sql = queryRaw.mock.calls[0][0].strings.join(' ');
    expect(sql).toContain('DISTINCT ON (channel_account_id, campaign_identity, business_date)');
    expect(sql).toContain('GROUP BY channel_account_id, campaign_identity');
    expect(sql).not.toContain('COALESCE(NULLIF(BTRIM(campaign_name)');
  });

  it('scopes product drill-down by channel account and stable identity', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const adapter = new AdCampaignRepositoryAdapter({ $queryRaw: queryRaw } as never);

    await adapter.findProductTargetRollups(
      '00000000-0000-4000-8000-000000000001',
      '7d',
      {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        campaignIdentity: 'href:https://advertising.coupang.com/marketing/campaign/1/product',
      },
    );

    const sql = queryRaw.mock.calls[0][0].strings.join(' ');
    expect(sql).toContain('channel_account_id =');
    expect(sql).toContain('campaign_identity =');
    expect(sql).not.toContain('campaign_name =');
  });
});
