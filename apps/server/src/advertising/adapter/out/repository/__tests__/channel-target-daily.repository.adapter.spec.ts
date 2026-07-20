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
  campaignName: 'Campaign 1',
  targets: [{
    organizationId: ORGANIZATION_ID,
    channel: 'coupang',
    businessDate: BUSINESS_DATE,
    targetType: 'product' as const,
    targetKey: `account:${ACCOUNT_ID}:product:campaign-1:item-1`,
    campaignId: 'campaign-1',
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
        where: { id: 'current-1', organizationId: ORGANIZATION_ID },
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
