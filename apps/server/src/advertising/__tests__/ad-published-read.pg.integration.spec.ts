import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  OTHER_ORGANIZATION_ID as OTHER,
} from '../../test-helpers/real-prisma';
import { AdCampaignRepositoryAdapter } from '../adapter/out/repository/ad-campaign.repository.adapter';
import { AdActionRepositoryAdapter } from '../adapter/out/repository/ad-action.repository.adapter';
import { AdCampaignsService } from '../application/service/ad-campaigns.service';
import { AdListingRepositoryAdapter } from '../adapter/out/repository/ad-listing.repository.adapter';
import { periodBounds } from '../domain/ad-metrics';
import type { PrismaClient, SourceImportRun } from '@prisma/client';

describe('published Advertising snapshots through campaign and action readers', () => {
  let db: PrismaClient;
  let campaigns: AdCampaignRepositoryAdapter;
  let actions: AdActionRepositoryAdapter;
  let account: string;
  let generation = 0;
  const day = periodBounds('7d').to.toISOString().slice(0, 10);
  const at = (hour: number) => new Date(Date.UTC(2026, 8, 1, hour)).toISOString();
  type Group = {
    adGroupId: string;
    capturedAt: string;
    campaignIdentity?: string;
    businessDate?: string;
  };
  beforeAll(async () => {
    db = makeTestPrisma();
    await db.$connect();
    campaigns = new AdCampaignRepositoryAdapter(db as never);
    actions = new AdActionRepositoryAdapter(db as never, {} as never);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  beforeEach(async () => {
    generation = 0;
    await resetDb(db);
    await seedBaseFixture(db);
    account = (
      await db.channelAccount.create({
        data: {
          organizationId: ORG,
          channel: 'coupang',
          name: 'Ads',
          status: 'active',
          isPrimary: true,
        },
      })
    ).id;
  });
  async function source(
    groups: Group[],
    options: {
      full?: boolean;
      rosterAt?: string;
      status?: string;
      completedAt?: string;
      channelAccountId?: string;
      organizationId?: string;
      generation?: number;
      id?: string;
    } = {},
  ) {
    const businessDates = Array.from({ length: 31 }, (_, i) =>
      new Date(new Date(day).getTime() - i * 86400000).toISOString().slice(0, 10),
    );
    return db.sourceImportRun.create({
      data: {
        id: options.id ?? randomUUID(),
        organizationId: options.organizationId ?? ORG,
        channelAccountId: options.channelAccountId ?? account,
        sourceType: options.full ? 'coupang_ad_keyword' : 'coupang_ad_campaign',
        parserVersion: options.full ? 'ad-keyword-v1' : 'ad-campaign-v1',
        status: options.status ?? 'completed',
        importedAt: new Date(options.completedAt ?? at(20)),
        freshnessGeneration: BigInt(options.generation ?? ++generation),
        plan: {
          ...(options.full ? {} : { captureMode: 'campaign_sweep' }),
          businessDates,
          startDate: businessDates[30],
          endDate: day,
        },
        qualityReport: {
          ...(options.full ? { rosterCapturedAt: options.rosterAt ?? at(1) } : {}),
          keywordCoverage: groups.map((group) => ({
            campaignIdentity: 'campaign:1',
            businessDate: day,
            ...group,
          })),
          campaignDescriptors: [
            {
              campaignId: '1',
              campaignIdentity: 'campaign:1',
              campaignName: 'Campaign',
              status: '운영중',
              onOff: 'ON',
              mode: 'daily',
            },
          ],
        },
      },
    });
  }
  async function fact(
    owner: SourceImportRun | null,
    group: string,
    spend: number,
    options: {
      targetKey?: string;
      businessDate?: string;
      type?: string;
      organizationId?: string;
      channelAccountId?: string;
    } = {},
  ) {
    return db.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: options.organizationId ?? owner?.organizationId ?? ORG,
        channelAccountId: options.channelAccountId ?? owner?.channelAccountId ?? account,
        channel: 'coupang',
        sourceImportRunId: owner?.id,
        businessDate: new Date(options.businessDate ?? day),
        targetType: options.type ?? 'keyword',
        targetKey: options.targetKey ?? 'shared-key',
        campaignIdentity: 'campaign:1',
        campaignId: '1',
        campaignName: 'Campaign',
        adGroupId: group,
        adGroup: 'Same display name',
        keyword: 'toy',
        spend,
        revenue: spend * 2,
        impressions: spend * 3,
        clicks: spend,
        metaJson: {
          source: 'advertising.keyword.target',
          data: {
            productName: 'Unmatched toy',
            windowDays: 7,
            granularity: options.type ?? 'keyword',
          },
        },
      },
    });
  }
  async function keywordSpends() {
    const rollups = await campaigns.findKeywordTargetRollups(ORG, '7d');
    const targets = (await actions.findLatestTargetRows(ORG)).filter(
      (row) => row.targetType === 'keyword',
    );
    expect(targets.map((row) => row.spend).sort((a, b) => a - b)).toEqual(
      rollups.map((row) => row.spend).sort((a, b) => a - b),
    );
    return rollups.map((row) => row.spend).sort((a, b) => a - b);
  }

  it('selects COMPLETE group coverage before merging target keys and never merges accounts', async () => {
    const full = await source(
      [
        { adGroupId: '1', capturedAt: at(2) },
        { adGroupId: '2', capturedAt: at(2) },
      ],
      { full: true },
    );
    await fact(full, '1', 10);
    await fact(full, '2', 20);
    const auxiliary = await source([{ adGroupId: '1', capturedAt: at(3) }]);
    const selected = await fact(auxiliary, '1', 40);
    await fact(
      await source([{ adGroupId: '2', capturedAt: at(4) }], {
        status: 'running',
      }),
      '2',
      1000,
    );
    await fact(
      await source([{ adGroupId: '2', capturedAt: at(5) }], {
        status: 'failed',
      }),
      '2',
      2000,
    );
    await fact(await source([]), '2', 3000); // absent coverage cannot publish a staged fact
    await fact(null, '1', 4000);
    const secondAccount = await db.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Other account' },
    });
    const second = await source([{ adGroupId: '1', capturedAt: at(2) }], {
      full: true,
      channelAccountId: secondAccount.id,
    });
    await fact(second, '1', 7);
    expect(await keywordSpends()).toEqual([7, 60]);
    const target = (await actions.findLatestTargetRows(ORG)).find((row) => row.spend === 60)!;
    expect(target).toMatchObject({
      id: selected.id,
      productName: 'Unmatched toy',
      listingId: null,
    });
  });

  it('publishes auxiliary proven-empty only for its group, then a newer full empty roster clears the account', async () => {
    const full = await source(
      [
        { adGroupId: '1', capturedAt: at(2) },
        { adGroupId: '2', capturedAt: at(2) },
      ],
      { full: true },
    );
    await fact(full, '1', 10);
    await fact(full, '2', 20);
    await source([{ adGroupId: '1', capturedAt: at(3) }]);
    expect(await keywordSpends()).toEqual([20]);
    await source([], { full: true, rosterAt: at(4), status: 'failed' });
    expect(await keywordSpends()).toEqual([20]);
    await source([], { full: true, rosterAt: at(5) });
    expect(await keywordSpends()).toEqual([]);
  });

  it('orders by actual group observation, not delayed completion or an unrelated group capture', async () => {
    const auxiliary = await source([{ adGroupId: '1', capturedAt: at(4) }], {
      completedAt: at(5),
    });
    await fact(auxiliary, '1', 40);
    const delayed = await source([{ adGroupId: '1', capturedAt: at(3) }], {
      completedAt: at(9),
    });
    await fact(delayed, '1', 300);
    const full = await source([{ adGroupId: '2', capturedAt: at(8) }], {
      full: true,
      rosterAt: at(2),
      completedAt: at(10),
    });
    await fact(full, '2', 20);
    expect(await keywordSpends()).toEqual([60]);
    const newer = await source([{ adGroupId: '1', capturedAt: at(11) }], {
      full: true,
      rosterAt: at(10),
    });
    await fact(newer, '1', 11);
    expect(await keywordSpends()).toEqual([11]);
  });

  it('does not resurrect an older in-period row when the selected observation is out of period', async () => {
    const old = await source([{ adGroupId: '1', capturedAt: at(2) }], {
      full: true,
    });
    await fact(old, '1', 10);
    const past = new Date(new Date(day).getTime() - 20 * 86400000).toISOString().slice(0, 10);
    const newer = await source([{ adGroupId: '1', capturedAt: at(3), businessDate: past }]);
    await fact(newer, '1', 20, { businessDate: past });
    expect(await campaigns.findKeywordTargetRollups(ORG, '7d')).toEqual([]);
    expect((await actions.findLatestTargetRows(ORG)).map((row) => row.spend)).toEqual([20]);
  });

  it('uses deterministic completion/id ties only after observation and isolates organizations', async () => {
    const lower = await source([{ adGroupId: '1', capturedAt: at(3) }], {
      id: '11111111-1111-4111-8111-111111111111',
    });
    const higher = await source([{ adGroupId: '1', capturedAt: at(3) }], {
      id: '22222222-2222-4222-8222-222222222222',
    });
    await fact(lower, '1', 10);
    await fact(higher, '1', 20);
    const otherAccount = await db.channelAccount.create({
      data: { organizationId: OTHER, channel: 'coupang', name: 'Other org' },
    });
    const foreign = await source([{ adGroupId: '1', capturedAt: at(9) }], {
      organizationId: OTHER,
      channelAccountId: otherAccount.id,
    });
    await fact(foreign, '1', 999999);
    expect(await keywordSpends()).toEqual([20]);
  });

  it('serves one complete campaign generation across rollups, actions and sweep metadata, including empty', async () => {
    const old = await source([], { generation: 1 });
    await fact(old, '1', 10, { type: 'campaign', targetKey: 'campaign-key' });
    await fact(old, '2', 20, { type: 'product', targetKey: 'old-product' });
    const failed = await source([], { generation: 9, status: 'failed' });
    await fact(failed, '1', 900, {
      type: 'campaign',
      targetKey: 'campaign-key',
    });
    expect((await campaigns.findCampaignSnapshot(ORG, '7d').then((snapshot) => snapshot.rollups))[0].spend).toBe(10);
    expect((await campaigns.findProductTargetRollups(ORG, '7d'))[0].spend).toBe(20);
    const next = await source([], { generation: 2 });
    await fact(next, '1', 30, { type: 'campaign', targetKey: 'campaign-key' });
    expect((await campaigns.findCampaignSnapshot(ORG, '7d').then((snapshot) => snapshot.rollups))[0].spend).toBe(30);
    expect(await campaigns.findProductTargetRollups(ORG, '7d')).toEqual([]);
    expect((await actions.findLatestTargetRows(ORG)).map((row) => row.spend)).toEqual([30]);
    expect(await campaigns.findCampaignSnapshot(ORG, '7d').then((snapshot) => snapshot.currentSweeps)).toMatchObject([
      {
        channelAccountId: account,
        rosterComplete: true,
        campaigns: [{ campaignIdentity: 'campaign:1' }],
      },
    ]);
    const empty = await source([], { generation: 3 });
    await db.sourceImportRun.update({
      where: { id: empty.id },
      data: {
        qualityReport: { keywordCoverage: [], campaignDescriptors: [] },
      },
    });
    expect(await campaigns.findCampaignSnapshot(ORG, '7d').then((snapshot) => snapshot.rollups)).toEqual([]);
    expect(await campaigns.findProductTargetRollups(ORG, '7d')).toEqual([]);
    expect(await actions.findLatestTargetRows(ORG)).toEqual([]);
    expect(await campaigns.findCampaignSnapshot(ORG, '7d').then((snapshot) => snapshot.currentSweeps)).toMatchObject([
      { channelAccountId: account, campaigns: [] },
    ]);
  });
  it('keeps getCampaigns metrics and current roster on one snapshot during publication', async () => {
    const old = await source([], { generation: 1 });
    await fact(old, '1', 10, { type: 'campaign', targetKey: 'campaign-key' });
    const newer = await source([], { generation: 2, status: 'running' });
    await fact(newer, '1', 20, { type: 'campaign', targetKey: 'campaign-key' });
    const observing = db.$extends({
      query: {
        async $queryRaw({ args, query }) {
          const result = await query(args);
          const sql = (args as { strings?: readonly string[] }).strings?.join(' ') ?? '';
          if (sql.includes('WITH scoped AS')) {
            await db.sourceImportRun.update({ where: { id: newer.id }, data: {
              status: 'completed',
              qualityReport: { keywordCoverage: [], campaignDescriptors: [{
                campaignId: '1', campaignIdentity: 'campaign:1', campaignName: 'New campaign name',
                status: '중지', onOff: 'OFF', mode: 'daily',
              }] },
            } });
          }
          return result;
        },
      },
    });
    const service = new AdCampaignsService(
      new AdCampaignRepositoryAdapter(observing as never),
      new AdListingRepositoryAdapter(db as never), {} as never, actions, {} as never,
    );
    expect(await service.getCampaigns('7d', ORG)).toMatchObject([{
      campaignName: 'Campaign', onOff: 'ON', metrics: { spend: 10 },
    }]);
    expect(await service.getCampaigns('7d', ORG)).toMatchObject([{
      campaignName: 'New campaign name', onOff: 'OFF', metrics: { spend: 20 },
    }]);
  });

});
