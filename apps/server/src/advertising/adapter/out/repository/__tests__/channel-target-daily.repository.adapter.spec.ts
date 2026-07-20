import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelTargetDailyRepositoryAdapter } from '../channel-target-daily.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const BUSINESS_DATE = new Date('2026-07-17T00:00:00.000Z');

describe('ChannelTargetDailyRepositoryAdapter.replaceCampaignDay', () => {
  let tx: {
    channelAdTargetDailySnapshot: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    adAction: { updateMany: ReturnType<typeof vi.fn> };
    $executeRaw: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  let adapter: ChannelTargetDailyRepositoryAdapter;
  let transactionMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tx = {
      channelAdTargetDailySnapshot: {
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      adAction: { updateMany: vi.fn(async () => ({ count: 0 })) },
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async () => [{ pg_advisory_xact_lock: null }]),
    };
    transactionMock = vi.fn(async (operation) => operation(tx));
    const prisma = { $transaction: transactionMock };
    adapter = new ChannelTargetDailyRepositoryAdapter(prisma as never);
  });

  const target = (targetKey: string) => ({
    organizationId: ORGANIZATION_ID,
    channel: 'coupang',
    businessDate: BUSINESS_DATE,
    targetType: 'product' as const,
    targetKey,
    campaignId: 'campaign-1',
    campaignName: 'Same name',
    externalOptionId: targetKey,
    metaJson: {
      source: 'advertising.campaign.target',
      data: { pageType: 'product' },
    },
  });

  it('upserts the complete desired set before deleting the stale B target', async () => {
    tx.channelAdTargetDailySnapshot.findMany.mockResolvedValueOnce([
      { id: 'fact-a', targetKey: 'product:campaign-1:A' },
      { id: 'fact-b', targetKey: 'product:campaign-1:B' },
    ]);

    const result = await adapter.replaceCampaignDay({
      organizationId: ORGANIZATION_ID,
      channel: 'coupang',
      businessDate: BUSINESS_DATE,
      campaignId: 'campaign-1',
      campaignName: 'Same name',
      targets: [target('product:campaign-1:A')],
    });

    expect(result).toEqual({ upsertedCount: 1, deletedCount: 1 });
    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 120_000,
    });
    expect(tx.channelAdTargetDailySnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        id: { in: ['fact-b'] },
      },
    });
  });

  it('limits cleanup to exact campaign id and campaign provenance', async () => {
    await adapter.replaceCampaignDay({
      organizationId: ORGANIZATION_ID,
      channel: 'coupang',
      businessDate: BUSINESS_DATE,
      campaignId: 'campaign-1',
      campaignName: 'Same name',
      targets: [target('product:campaign-1:A')],
    });

    expect(tx.channelAdTargetDailySnapshot.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        channel: 'coupang',
        businessDate: BUSINESS_DATE,
        AND: [
          { campaignId: 'campaign-1' },
          {
            metaJson: {
              path: ['advertising.campaign.target'],
              not: expect.anything(),
            },
          },
        ],
      },
      select: { id: true, targetKey: true },
    });
  });

  it('never begins stale deletion when any desired insert fails', async () => {
    tx.$executeRaw.mockRejectedValueOnce(new Error('foreign key failure'));

    await expect(
      adapter.replaceCampaignDay({
        organizationId: ORGANIZATION_ID,
        channel: 'coupang',
        businessDate: BUSINESS_DATE,
        campaignId: 'campaign-1',
        campaignName: 'Same name',
        targets: [
          target('product:campaign-1:A'),
          target('product:campaign-1:B'),
        ],
      }),
    ).rejects.toThrow('foreign key failure');

    expect(tx.channelAdTargetDailySnapshot.findMany).not.toHaveBeenCalled();
    expect(tx.channelAdTargetDailySnapshot.deleteMany).not.toHaveBeenCalled();
    expect(tx.adAction.updateMany).not.toHaveBeenCalled();
  });

  it('scopes id-less same-name campaigns by canonical campaign identity', async () => {
    const campaignIdentity =
      'href:https://advertising.coupang.com/campaign/identity-a';
    const identityTarget = {
      ...target('product:identity-a:A'),
      campaignId: null,
      metaJson: {
        source: 'advertising.campaign.target',
        data: { pageType: 'product', campaignIdentity },
      },
    };

    await adapter.replaceCampaignDay({
      organizationId: ORGANIZATION_ID,
      channel: 'coupang',
      businessDate: BUSINESS_DATE,
      campaignIdentity,
      campaignName: 'Same name',
      targets: [identityTarget],
    });

    expect(tx.channelAdTargetDailySnapshot.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        channel: 'coupang',
        businessDate: BUSINESS_DATE,
        AND: [
          {
            campaignId: null,
            campaignName: 'Same name',
            metaJson: {
              path: [
                'advertising.campaign.target',
                'campaignIdentity',
              ],
              equals: campaignIdentity,
            },
          },
          {},
        ],
      },
      select: { id: true, targetKey: true },
    });
  });

  it('uses bounded set-based chunks instead of one database round trip per target', async () => {
    const targets = Array.from({ length: 501 }, (_, index) =>
      target(`product:campaign-1:${index}`),
    );

    await adapter.replaceCampaignDay({
      organizationId: ORGANIZATION_ID,
      channel: 'coupang',
      businessDate: BUSINESS_DATE,
      campaignId: 'campaign-1',
      campaignName: 'Same name',
      targets,
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
  });
});
