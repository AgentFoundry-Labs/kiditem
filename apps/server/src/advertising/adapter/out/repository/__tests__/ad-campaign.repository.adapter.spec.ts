import { describe, expect, it, vi } from 'vitest';
import { AdCampaignRepositoryAdapter } from '../ad-campaign.repository.adapter';

describe('AdCampaignRepositoryAdapter campaign identity grain', () => {
  async function campaignRollupSql(): Promise<string> {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const adapter = new AdCampaignRepositoryAdapter({ $queryRaw: queryRaw } as never);

    await adapter.findCampaignRollups(
      '00000000-0000-4000-8000-000000000001',
      '7d',
    );

    return queryRaw.mock.calls[0][0].strings.join(' ');
  }

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

  it('folds stable-identity product facts into a campaign/day fallback', async () => {
    const sql = await campaignRollupSql();

    expect(sql).toContain('product_daily AS');
    expect(sql).toContain("target_type = 'product'");
    expect(sql).toContain(
      'GROUP BY channel_account_id, campaign_identity, business_date',
    );
    expect(sql).toContain('SUM(spend) AS spend');
  });

  it('prefers an explicit campaign fact over product fallback on the same day', async () => {
    const sql = await campaignRollupSql();

    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain(
      'campaign_daily.channel_account_id = product_daily.channel_account_id',
    );
    expect(sql).toContain(
      'campaign_daily.campaign_identity = product_daily.campaign_identity',
    );
    expect(sql).toContain(
      'campaign_daily.business_date = product_daily.business_date',
    );
  });

  it('unions explicit and fallback days before the period rollup', async () => {
    const sql = await campaignRollupSql();

    expect(sql).toContain('SELECT * FROM campaign_daily');
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('SELECT product_daily.*');
    expect(sql).toContain(
      'GROUP BY channel_account_id, campaign_identity',
    );
  });

  it('reads current campaign state only from an identity-complete terminal sweep marker', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        collectionRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        collectionAttempt: 2,
        completedAt: new Date('2026-07-24T03:00:00.000Z'),
        campaignDailyCollectionComplete: true,
        campaignDailyWindowDays: 31,
        campaignDailyFrom: '2026-06-24',
        campaignDailyTo: '2026-07-24',
        rosterComplete: true,
        dailyFactsComplete: true,
        campaignIdentity: 'campaign:active',
        campaignId: 'active',
        campaignName: '운영 캠페인',
        status: '운영중',
        onOff: 'ON',
      },
      {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        collectionRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        collectionAttempt: 2,
        completedAt: new Date('2026-07-24T03:00:00.000Z'),
        campaignDailyCollectionComplete: true,
        campaignDailyWindowDays: 31,
        campaignDailyFrom: '2026-06-24',
        campaignDailyTo: '2026-07-24',
        rosterComplete: true,
        dailyFactsComplete: true,
        campaignIdentity: 'campaign:paused',
        campaignId: 'paused',
        campaignName: '중지 캠페인',
        status: '일시정지',
        onOff: 'OFF',
      },
    ]);
    const adapter = new AdCampaignRepositoryAdapter({
      $queryRaw: queryRaw,
    } as never);

    const sweeps = await adapter.findLatestCompleteCampaignSweeps(
      '00000000-0000-4000-8000-000000000001',
    );

    expect(sweeps).toEqual([
      {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        collectionRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        collectionAttempt: 2,
        completedAt: new Date('2026-07-24T03:00:00.000Z'),
        campaignDailyCollectionComplete: true,
        campaignDailyWindowDays: 31,
        campaignDailyFrom: '2026-06-24',
        campaignDailyTo: '2026-07-24',
        rosterComplete: true,
        dailyFactsComplete: true,
        campaigns: [
          expect.objectContaining({
            campaignIdentity: 'campaign:active',
            onOff: 'ON',
          }),
          expect.objectContaining({
            campaignIdentity: 'campaign:paused',
            onOff: 'OFF',
          }),
        ],
      },
    ]);
    const sql = queryRaw.mock.calls[0][0].strings.join(' ');
    expect(sql).toContain("meta_json ->> 'campaignSweepComplete' = 'true'");
    expect(sql).toContain("meta_json ->> 'campaignIdentityComplete' = 'true'");
    expect(sql).not.toContain(
      "AND meta_json ->> 'campaignIdentityComplete' = 'true'",
    );
    expect(sql).toContain(
      "observed_run.meta_json ->> 'collectionRunId'",
    );
    expect(sql).toContain(
      "observed_run.meta_json ->> 'collectionAttempt'",
    );
    expect(sql).toContain('observed_campaign_count');
    expect(sql).toContain('marker.expected_campaign_count');
    expect(sql).toContain('marker.identity_complete');
    expect(sql).toContain('observed_run.error_count = 0');
    expect(sql).toContain('observed_run.id <> marker.marker_run_id');
    expect(sql).toContain(
      'observed_run.finished_at <= marker.marker_finished_at',
    );
    expect(sql).toContain(
      "effective_scope = 'single_campaign_authoritative'",
    );
    expect(sql).toContain('daily_projection_skipped = false');
    expect(sql).toContain(
      'fact.raw_snapshot_id = observed.snapshot_id',
    );
    expect(sql).toContain(
      'fact.business_date = observed.business_date',
    );
    expect(sql).toContain(
      'COUNT(DISTINCT business_date)::int',
    );
    expect(sql).toContain(
      "requested_scope = 'single_campaign_metadata_raw'",
    );
    expect(sql).toContain('coverage.observed_from = marker.daily_from');
    expect(sql).toContain('coverage.observed_to = marker.daily_to');
  });

  it('preserves a completed empty campaign roster row', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        collectionRunId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        collectionAttempt: 1,
        completedAt: new Date('2026-07-24T03:00:00.000Z'),
        campaignDailyCollectionComplete: false,
        campaignDailyWindowDays: null,
        campaignDailyFrom: null,
        campaignDailyTo: null,
        rosterComplete: true,
        dailyFactsComplete: false,
        campaignIdentity: null,
        campaignId: null,
        campaignName: null,
        status: null,
        onOff: null,
      },
    ]);
    const adapter = new AdCampaignRepositoryAdapter({
      $queryRaw: queryRaw,
    } as never);

    await expect(
      adapter.findLatestCompleteCampaignSweeps(
        '00000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        rosterComplete: true,
        campaigns: [],
      }),
    ]);
  });

  it('binds account-less freshness to the same deterministic primary account instead of a newer secondary sweep', async () => {
    const primaryAccountId = '11111111-1111-4111-8111-111111111111';
    const secondaryAccountId = '22222222-2222-4222-8222-222222222222';
    const findFirst = vi.fn().mockResolvedValue({ id: primaryAccountId });
    const queryRaw = vi.fn().mockResolvedValue([
      {
        channelAccountId: primaryAccountId,
        collectionRunId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        collectionAttempt: 1,
        completedAt: new Date('2026-07-24T03:00:00.000Z'),
        campaignDailyCollectionComplete: true,
        campaignDailyWindowDays: 31,
        campaignDailyFrom: '2026-06-24',
        campaignDailyTo: '2026-07-24',
        rosterComplete: true,
        dailyFactsComplete: true,
        campaignIdentity: null,
        campaignId: null,
        campaignName: null,
        status: null,
        onOff: null,
      },
    ]);
    const adapter = new AdCampaignRepositoryAdapter({
      channelAccount: { findFirst },
      $queryRaw: queryRaw,
    } as never);

    await expect(
      adapter.findAccountlessSyncCampaignSweep(
        '00000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toMatchObject({
      channelAccountId: primaryAccountId,
      dailyFactsComplete: true,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: '00000000-0000-4000-8000-000000000001',
        channel: 'coupang',
        status: 'active',
      },
      orderBy: [
        { isPrimary: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });
    const query = queryRaw.mock.calls[0][0];
    expect(query.strings.join(' ')).toContain('AND channel_account_id =');
    expect(query.values).toContain(primaryAccountId);
    expect(query.values).not.toContain(secondaryAccountId);
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
