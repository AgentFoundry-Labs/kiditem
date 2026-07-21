import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelTargetDailyRepositoryAdapter } from '../channel-target-daily.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000002';
const BUSINESS_DATE = new Date('2026-07-17T00:00:00Z');

const target = () => ({
  organizationId: ORGANIZATION_ID,
  channelAccountId: ACCOUNT_ID,
  channel: 'coupang',
  businessDate: BUSINESS_DATE,
  campaignId: 'campaign-1',
  campaignIdentity: 'campaign:campaign-1',
  campaignName: 'Campaign 1',
  targets: [{
    organizationId: ORGANIZATION_ID,
    channelAccountId: ACCOUNT_ID,
    channel: 'coupang',
    businessDate: BUSINESS_DATE,
    targetType: 'product' as const,
    targetKey: `account:${ACCOUNT_ID}:product:campaign-1:item-1`,
    campaignId: 'campaign-1',
    campaignIdentity: 'campaign:campaign-1',
    campaignName: 'Campaign 1',
    externalOptionId: 'item-1',
    spend: 100,
  }],
});

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'current-1',
  targetKey: `account:${ACCOUNT_ID}:product:campaign-1:item-1`,
  targetType: 'product',
  campaignId: 'campaign-1',
  campaignName: 'Campaign 1',
  adGroup: null,
  keyword: null,
  listingId: null,
  listingOptionId: null,
  externalId: null,
  externalOptionId: 'item-1',
  rawSnapshotId: '00000000-0000-4000-8000-000000000003',
  actionIds: [],
  firstObservedAt: new Date('2026-07-17T00:00:00Z'),
  lastObservedAt: new Date('2026-07-17T01:00:00Z'),
  createdAt: new Date('2026-07-17T00:00:00Z'),
  updatedAt: new Date('2026-07-17T01:00:00Z'),
  sampleCount: 1,
  spend: 10,
  revenue: 20,
  impressions: 30,
  clicks: 4,
  conversions: 1,
  orders: 1,
  adSpend: 10,
  adRevenue: 20,
  ...overrides,
});

describe('ChannelTargetDailyRepositoryAdapter.replaceCampaignDay', () => {
  let tx: any;
  let adapter: ChannelTargetDailyRepositoryAdapter;
  let transactionMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: '1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      channelAdTargetDailySnapshot: {
        create: vi.fn(async () => ({ id: 'created-1' })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
        upsert: vi.fn(async () => ({ id: 'created-1' })),
      },
      adAction: { updateMany: vi.fn(async () => ({ count: 1 })) },
      $executeRaw: vi.fn(async () => 1),
    };
    transactionMock = vi.fn(
      async (operation: (client: unknown) => unknown) => operation(tx),
    );
    const prisma = { $transaction: transactionMock };
    adapter = new ChannelTargetDailyRepositoryAdapter(prisma as never);
  });

  it('updates an exact current-format target in place', async () => {
    tx.$queryRaw.mockReset()
      .mockResolvedValueOnce([{ locked: '1' }])
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([]);

    await expect(adapter.replaceCampaignDay(target())).resolves.toMatchObject({
      kind: 'replaced',
      upsertedCount: 1,
      deletedCount: 0,
    });
    expect(tx.channelAdTargetDailySnapshot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'current-1',
          organizationId: ORGANIZATION_ID,
          channelAccountId: ACCOUNT_ID,
        },
        data: expect.objectContaining({ targetKey: target().targets[0].targetKey }),
      }),
    );
    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 120_000,
    });
    const campaignQuery = tx.$queryRaw.mock.calls[1][0];
    const sql = campaignQuery.strings.join(' ');
    expect(sql).not.toContain('channel_scrape_snapshots');
    expect(sql).not.toContain('channel_scrape_runs');
    expect(sql).not.toContain('rawAccountId');
    expect(sql).not.toContain('channel_listings');
    expect(sql).toContain('starts_with(target.target_key,');
    expect(sql).toContain('target.channel_account_id');
    expect(sql).toContain('target.campaign_identity');
    expect(sql).not.toContain('target.campaign_name =');
  });

  it('uses account-scoped fact uniqueness for direct upsert', async () => {
    tx.channelAdTargetDailySnapshot.upsert.mockResolvedValueOnce({ id: 'created-1' });

    await adapter.upsert(target().targets[0]);

    expect(tx.channelAdTargetDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_channelAccountId_channel_businessDate_targetType_targetKey: {
            organizationId: ORGANIZATION_ID,
            channelAccountId: ACCOUNT_ID,
            channel: 'coupang',
            businessDate: BUSINESS_DATE,
            targetType: 'product',
            targetKey: target().targets[0].targetKey,
          },
        },
        create: expect.objectContaining({
          channelAccountId: ACCOUNT_ID,
          campaignIdentity: 'campaign:campaign-1',
        }),
      }),
    );
  });

  it('rejects a product with campaign evidence but no stable identity at the repository boundary', async () => {
    const input = {
      ...target().targets[0],
      targetKey: `account:${ACCOUNT_ID}:product:item-1`,
      campaignId: null,
      campaignIdentity: null,
      campaignName: 'Name-only campaign',
    };

    await expect(adapter.upsert(input)).rejects.toThrow(
      'missing_stable_campaign_identity',
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('allows null campaign identity only for an explicitly campaign-less product', async () => {
    const input = {
      ...target().targets[0],
      targetKey: `account:${ACCOUNT_ID}:product:item-1`,
      campaignId: null,
      campaignIdentity: null,
      campaignName: null,
      campaignless: true,
    };

    await adapter.upsert(input);

    expect(tx.channelAdTargetDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ campaignIdentity: null }),
        update: expect.not.objectContaining({
          campaignIdentity: expect.any(String),
        }),
      }),
    );
  });

  it.each([
    { evidence: 'adGroup', adGroup: 'Group A', keyword: null },
    { evidence: 'keyword', adGroup: null, keyword: 'kids cup' },
  ])(
    'rejects an explicitly campaign-less product carrying $evidence evidence',
    async ({ adGroup, keyword }) => {
      const input = {
        ...target().targets[0],
        targetKey: `account:${ACCOUNT_ID}:product:item-1`,
        campaignId: null,
        campaignIdentity: null,
        campaignName: null,
        campaignless: true,
        adGroup,
        keyword,
      };

      await expect(adapter.upsert(input)).rejects.toThrow(
        'missing_stable_campaign_identity',
      );
      expect(transactionMock).not.toHaveBeenCalled();
    },
  );

  it('persists one canonical identity in both direct-upsert create and update descriptors', async () => {
    const input = {
      ...target().targets[0],
      campaignId: 'campaign-1',
      campaignIdentity:
        'href:https://advertising.coupang.com/marketing/campaign/campaign-1/product?z=2&campaignId=campaign-1&a=1#ignored',
      targetKey:
        `account:${ACCOUNT_ID}:product:href:https://advertising.coupang.com/marketing/campaign/campaign-1/product?z=2&campaignId=campaign-1&a=1#ignored:item-1`,
    };

    await adapter.upsert(input);

    expect(tx.channelAdTargetDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          campaignId: 'campaign-1',
          campaignIdentity: 'campaign:campaign-1',
          targetKey: `account:${ACCOUNT_ID}:product:campaign-1:item-1`,
        }),
        update: expect.objectContaining({
          campaignId: 'campaign-1',
          campaignIdentity: 'campaign:campaign-1',
        }),
        where: expect.objectContaining({
          organizationId_channelAccountId_channel_businessDate_targetType_targetKey:
            expect.objectContaining({
              targetKey: `account:${ACCOUNT_ID}:product:campaign-1:item-1`,
            }),
        }),
      }),
    );
  });

  it('persists canonical replacement descriptors for both update and create', async () => {
    const rawIdentity =
      'href:https://advertising.coupang.com/marketing/campaign/campaign-1/product?campaignId=campaign-1#ignored';
    const base = target();
    const input = {
      ...base,
      campaignId: null,
      campaignIdentity: rawIdentity,
      targets: base.targets.map((item) => ({
        ...item,
        campaignId: null,
        campaignIdentity: rawIdentity,
        targetKey:
          `account:${ACCOUNT_ID}:product:${rawIdentity}:item-1`,
      })),
    };

    tx.$queryRaw.mockReset()
      .mockResolvedValueOnce([{ locked: '1' }])
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([]);
    await adapter.replaceCampaignDay(input);

    expect(tx.channelAdTargetDailySnapshot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: 'campaign-1',
          campaignIdentity: 'campaign:campaign-1',
          targetKey: `account:${ACCOUNT_ID}:product:campaign-1:item-1`,
        }),
      }),
    );

    tx.$queryRaw.mockReset()
      .mockResolvedValueOnce([{ locked: '1' }])
      .mockResolvedValueOnce([]);
    await adapter.replaceCampaignDay(input);

    expect(tx.channelAdTargetDailySnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: 'campaign-1',
          campaignIdentity: 'campaign:campaign-1',
          targetKey: `account:${ACCOUNT_ID}:product:campaign-1:item-1`,
        }),
      }),
    );
  });

  it('rejects a stale action before any writes', async () => {
    tx.$queryRaw.mockReset()
      .mockResolvedValueOnce([{ locked: '1' }])
      .mockResolvedValueOnce([row({
        targetKey: `account:${ACCOUNT_ID}:product:campaign-1:stale`,
        externalOptionId: 'stale',
        actionIds: ['action-1'],
      })])
      .mockResolvedValueOnce([{ id: 'action-1' }]);

    await expect(adapter.replaceCampaignDay(target())).resolves.toEqual({
      kind: 'rejected',
      code: 'dependent_action_conflict',
    });
    expect(tx.channelAdTargetDailySnapshot.updateMany).not.toHaveBeenCalled();
    expect(tx.channelAdTargetDailySnapshot.deleteMany).not.toHaveBeenCalled();
    expect(tx.adAction.updateMany).not.toHaveBeenCalled();
  });

  it('rejects targets outside the exact campaign scope before opening a transaction', async () => {
    const input = target();
    input.targets[0].campaignId = 'campaign-2';

    await expect(adapter.replaceCampaignDay(input)).rejects.toThrow(
      'target campaignId does not match replacement scope',
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects duplicate desired target keys before opening a transaction', async () => {
    const input = target();
    input.targets.push({ ...input.targets[0] });

    await expect(adapter.replaceCampaignDay(input)).rejects.toThrow(
      'duplicate targetKey',
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
