import { profitCatalogTestReaders } from '../../test-helpers/channel-fact-ports';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { json } from 'express';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { AdCampaignSourceStatusSchema } from '@kiditem/shared/advertising';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { AdCampaignSourceController } from '../adapter/in/http/ad-campaign-source.controller';
import { AdCampaignSourceRepository } from '../adapter/out/repository/ad-campaign-source.repository';
import { AdCampaignRepositoryAdapter } from '../adapter/out/repository/ad-campaign.repository.adapter';
import { AdActionRepositoryAdapter } from '../adapter/out/repository/ad-action.repository.adapter';
import { readAdWindowFacts } from '../adapter/out/persistence/read/ad-target-facts';
import { businessDateKey, evidenceCutoffDate } from '../../common/kst';
import type { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';

const base = '/api/ads/ad-campaigns';
describe('Ad campaign source incoming HTTP + disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let accountId: string;
  let owner: AdCampaignSourceRepository;
  let alerts: SourceFailureAlerts;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    owner = new AdCampaignSourceRepository(channelFactTestPorts(prisma as never).accounts, channelFactTestPorts(prisma as never).listings, prisma as never, alerts);
    const module = await Test.createTestingModule({
      controllers: [AdCampaignSourceController],
      providers: [{ provide: AdCampaignSourceRepository, useValue: owner }],
    }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    app.use(json({ limit: '25mb' }));
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { headers: Record<string, string>; authUser?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        req.authUser = {
          id: USER,
          organizationId: req.headers['x-test-org'] ?? ORG,
        };
        next();
      },
    );
    await app.init();
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    accountId = (
      await prisma.channelAccount.create({
        data: {
          organizationId: ORG,
          channel: 'coupang',
          name: 'Primary ads',
          isPrimary: true,
          vendorId: 'VENDOR-A',
        },
      })
    ).id;
  });
  const begin = (key = randomUUID(), body = {}) =>
    request(httpUrl).post(`${base}/attempts`).set('Idempotency-Key', key).send(body);
  const get = (path: string) => request(httpUrl).get(`${base}${path}`);
  const admit = async (key = randomUUID(), body = {}) => {
    const response = await begin(key, body).expect(201);
    return get(`/attempts/${response.body.attemptId}/control`).expect(200);
  };
  const put = (
    attempt: { attemptId: string; attemptToken: string },
    suffix: string,
    body: unknown,
  ) =>
    request(httpUrl)
      .put(`${base}/attempts/${attempt.attemptId}/${suffix}`)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send(body);
  const post = (
    attempt: { attemptId: string; attemptToken: string },
    suffix: string,
    body: unknown,
  ) =>
    request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/${suffix}`)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send(body);

  const common = () => ({ advertiserId: 'VENDOR-A', capturedAt: new Date().toISOString() });
  const descriptor = (key = 'camp', campaignId: string | null = '123') => ({
    key,
    name: 'Campaign',
    campaignId,
    identity: campaignId ? `campaign:${campaignId}` : null,
    href: 'https://advertising.coupang.com/campaigns/123',
    hasDetailHref: true,
    onOff: 'OFF',
    status: '종료',
    rowIndex: 0,
  });
  const page = (campaigns = [descriptor()]) => ({
    ...common(),
    kind: 'dashboard_page',
    key: 'dashboard:1',
    pageIndex: 1,
    totalPages: campaigns.length ? 1 : 0,
    verified: campaigns.length > 0,
    explicitEmpty: campaigns.length === 0,
    campaigns,
  });
  const resolve = (mode = 'daily', campaignId: string | null = '123', payload?: unknown) => ({
    ...common(),
    kind: 'campaign',
    key: 'campaign:camp',
    campaignKey: 'camp',
    campaignId,
    mode,
    ...(payload ? { payload } : {}),
  });
  const payload = (date: string, empty = false, spend = 12) => ({
    type: 'ad_campaign',
    source: 'advertising',
    campaignName: 'Campaign',
    campaignReportScope: 'single_campaign_authoritative',
    startDate: date,
    endDate: date,
    dashboardOnOff: 'OFF',
    dashboardStatus: '종료',
    timestamp: new Date().toISOString(),
    data: [{ raw: 'unchanged' }],
    normalizedRows: [
      empty
        ? { campaignId: '123', campaignName: 'Campaign', onOff: 'OFF', _campaignOnly: true }
        : {
            campaignId: '123',
            campaignName: 'Campaign',
            productName: 'Item',
            vendorItemId: 'OPTION-1',
            runningAdSpend: spend,
            revenue: spend > 0 ? 40 : 0,
            impressions: spend > 0 ? 100 : 0,
            clicks: spend > 0 ? 4 : 0,
            conversions: spend > 0 ? 2 : 0,
            orders: spend > 0 ? 2 : 0,
            onOff: 'ON',
          },
    ],
  });
  const day = (date: string, empty = false, spend = 12) => ({
    ...common(),
    kind: 'campaign_day',
    key: `day:camp:${date}`,
    campaignKey: 'camp',
    businessDate: date,
    payload: payload(date, empty, spend),
    proof: {
      dateApplied: true,
      complete: true,
      explicitEmpty: empty,
      expectedPages: 1,
      visitedPages: [1],
    },
  });
  const manualReport = (period: '7d' | '1d', startDate: string, endDate: string, targetUrl: string, empty = false, spend?: number) => ({
    ...common(),
    kind: 'manual_report',
    key: `manual_report:${period}:${startDate}:${endDate}`,
    period,
    startDate,
    endDate,
    payload: {
      type: 'ad_campaign',
      source: 'advertising',
      campaignName: '_전체',
      startDate,
      endDate,
      timestamp: new Date().toISOString(),
      url: targetUrl,
      data: empty ? [] : [{ raw: 'displayed-range' }],
      normalizedRows: spend === undefined ? [] : [{ campaignName: '_전체', runningAdSpend: spend }],
    },
  });
  const upload = (a: any, sequence: number, p: any) => put(a, `receipts/${sequence}`, p);
  const finish = async (a: any, status = 201) => {
    const view = (await get(`/attempts/${a.attemptId}`).expect(200)).body;
    return post(a, 'complete', { manifestChecksum: view.manifestChecksum }).expect(status);
  };
  const full = async () => {
    const a = (await admit()).body;
    await upload(a, 0, page()).expect(200);
    await upload(a, 1, resolve()).expect(200);
    for (const [index, date] of a.plan.businessDates.entries())
      await upload(a, index + 2, day(date, index === 30)).expect(200);
    return a;
  };
  /** A sweep whose product row on each requested date has `spendOn(date, plan)` spend. */
  const sweep = async (spendOn: (date: string, plan: { businessDates: string[] }) => number) => {
    const a = (await admit()).body;
    await upload(a, 0, page()).expect(200);
    await upload(a, 1, resolve()).expect(200);
    for (const [index, date] of a.plan.businessDates.entries())
      await upload(a, index + 2, day(date, false, spendOn(date, a.plan))).expect(200);
    return a;
  };
  const auxiliary = (a: any, failed = false, empty = false) => ({
    ...common(),
    kind: 'auxiliary_keywords',
    key: 'keywords:camp:g',
    campaignKey: 'camp',
    adGroupId: 'g',
    groupPlan: {
      advertiserId: 'VENDOR-A',
      adsArrayObserved: true,
      adGroupName: 'Group',
      enumeratedAdCount: 1,
      ads: [{ adId: 'a', vendorItemId: 'OPTION-1', itemName: 'Item', isActive: true }],
    },
    groupResult: {
      advertiserId: 'VENDOR-A',
      capturedAt: new Date().toISOString(),
      ads: [{ adId: 'a', metricsOk: !failed, registeredOk: true }],
      rows: empty
        ? []
        : [
            {
              adId: 'a',
              campaignId: '123',
              campaignName: 'Campaign',
              adGroup: 'Group',
              keyword: '문어',
              externalOptionId: 'OPTION-1',
              runningAdSpend: 5,
              revenue: 10,
            },
          ],
    },
  });

  it('freezes exactly 31 dates/account/24h, safe begin and replay before changed configuration/day', async () => {
    const key = randomUUID();
    const first = (await begin(key).expect(201)).body;
    expect(first).not.toHaveProperty('attemptToken');
    expect(first).not.toHaveProperty('receipts');
    expect(first.plan.captureMode).toBe('campaign_sweep');
    expect(first.plan.businessDates).toHaveLength(31);
    expect(first.plan.businessDates[0]).toBe(first.plan.endDate);
    expect(first.plan.businessDates[30]).toBe(first.plan.startDate);
    const control = (await get(`/attempts/${first.attemptId}/control`).expect(200)).body;
    expect(control.attemptToken).toMatch(/^[a-f0-9-]{36}$/);
    await prisma.channelAccount.update({
      where: { id: accountId, organizationId: ORG },
      data: { vendorId: 'CHANGED' },
    });
    expect((await begin(key).expect(201)).body).toEqual(first);
    expect((await get(`/attempts/${first.attemptId}/control`).expect(200)).body).toEqual(control);
    await begin(key, { channelAccountId: accountId }).expect(409);
    expect((await begin().expect(409)).body).toMatchObject({
      code: 'ATTEMPT_IN_PROGRESS',
      attemptId: first.attemptId,
    });
  });
  it('keeps all 31 day facts private until whole COMPLETE; preserves OFF historical dates, normalized metrics and raw rows', async () => {
    const a = await full();
    expect(
      await prisma.channelAdTargetDailySnapshot.count({
        where: { sourceImportRunId: a.attemptId },
      }),
    ).toBe(31);
    expect(
      await prisma.channelScrapeSnapshot.count({ where: { sourceImportRunId: a.attemptId } }),
    ).toBe(31);
    expect((await get('/source')).body).toMatchObject({
      ready: false,
      latestComplete: null,
    });
    const complete = (await finish(a, 201)).body;
    expect(complete).toMatchObject({ state: 'COMPLETE', rowCount: 31, campaignCount: 1 });
    expect((await finish(a, 201)).body).toEqual(complete);
    const row = await prisma.sourceImportRun.findFirstOrThrow({
      where: { id: a.attemptId, organizationId: ORG },
    });
    expect(row.qualityReport).toMatchObject({
      campaignDescriptors: [{ campaignId: '123', onOff: 'OFF', mode: 'daily' }],
    });
    expect((await get('/source')).body).toMatchObject({
      ready: true,
      latestComplete: { attemptId: a.attemptId },
    });
  });
  it('a completed sweep is what the listing-day ad reader calls measured: every declared date, with the published spend', async () => {
    const a = await full();
    // Staged facts are private until the terminal publication.
    expect((await readAdWindowFacts(prisma, { organizationId: ORG }, profitCatalogTestReaders(prisma as never).accounts)).days).toEqual([]);
    await finish(a, 201);

    const facts = await readAdWindowFacts(prisma, { organizationId: ORG }, profitCatalogTestReaders(prisma as never).accounts);

    // The plan declared 31 business dates; the last one was published as an
    // explicit empty day, which is a measured zero rather than a gap.
    expect(facts.days.map((row) => row.businessDate)).toEqual([...a.plan.businessDates].sort());
    expect(facts.days.filter((row) => row.spend === 12)).toHaveLength(30);
    expect(facts.days.filter((row) => row.spend === 0)).toHaveLength(1);
    expect(facts.observedAt).not.toBeNull();
  });
  it('requires every date and page; continuation uses original receipts with exact replay and no replacement', async () => {
    const a = (await admit()).body,
      p = page();
    await upload(a, 0, p).expect(200);
    await upload(a, 0, p).expect(200);
    await upload(a, 0, { ...p, verified: false }).expect(409);
    await upload(a, 2, resolve()).expect(409);
    await upload(a, 1, resolve()).expect(200);
    await upload(a, 2, day(a.plan.endDate)).expect(200);
    await finish(a, 409);
    expect((await get(`/attempts/${a.attemptId}/control`)).body.receipts).toHaveLength(3);
    expect((await get(`/attempts/${a.attemptId}/control`)).body).not.toHaveProperty('payload');
  });
  it('accepts observed empty roster without inventing verified pagination; new COMPLETE empty hides prior source generation', async () => {
    const prior = await full();
    await finish(prior, 201);
    const a = (await admit()).body;
    await upload(a, 0, page([])).expect(200);
    expect((await finish(a, 201)).body).toMatchObject({
      state: 'COMPLETE',
      rowCount: 0,
      campaignCount: 0,
    });
    expect((await get('/source')).body.latestComplete.attemptId).toBe(a.attemptId);
    expect(
      await prisma.channelAdTargetDailySnapshot.count({
        where: { sourceImportRunId: prior.attemptId },
      }),
    ).toBe(31);
  });
  it.each(['metadata', 'raw_only'])(
    'preserves %s descriptors/raw without fabricating day zeroes',
    async (mode) => {
      const a = (await admit()).body;
      await upload(
        a,
        0,
        page([{ ...descriptor('camp', mode === 'raw_only' ? null : '123'), hasDetailHref: false }]),
      ).expect(200);
      const raw = {
        ...payload(a.plan.endDate, true),
        campaignReportScope: 'single_campaign_metadata_raw',
      };
      await upload(a, 1, resolve(mode, mode === 'raw_only' ? null : '123', raw)).expect(200);
      const done = (await finish(a, 201)).body;
      expect(done).toMatchObject({
        state: 'COMPLETE',
        rowCount: 0,
        rawOnlyCampaignCount: mode === 'raw_only' ? 1 : 0,
        warningCount: mode === 'raw_only' ? 1 : 0,
      });
      expect(
        await prisma.channelScrapeSnapshot.count({ where: { sourceImportRunId: a.attemptId } }),
      ).toBe(1);
    },
  );
  it.each(['date', 'pages', 'identity'])(
    'fails closed for invalid %s proof and keeps previous COMPLETE',
    async (kind) => {
      const prior = (await admit()).body;
      await upload(prior, 0, page([])).expect(200);
      await finish(prior, 201);
      const a = (await admit()).body;
      await upload(a, 0, page()).expect(200);
      await upload(a, 1, resolve()).expect(200);
      const p = day(a.plan.endDate);
      if (kind === 'date') p.proof.dateApplied = false;
      if (kind === 'pages') p.proof.visitedPages = [];
      if (kind === 'identity') p.advertiserId = 'OTHER';
      expect((await upload(a, 2, p).expect(200)).body.state).toBe('FAILED');
    expect((await upload(a, 2, p).expect(200)).body.state).toBe('FAILED');
    expect((await get('/source')).body).toMatchObject({
      ready: true,
      latestComplete: { attemptId: prior.attemptId },
      });
      expect(await prisma.alert.count({ where: { organizationId: ORG, status: 'OPEN' } })).toBe(1);
    },
  );
  it.each(['success', 'empty', 'failure', 'unparseable'])(
    'keeps optional keyword %s inside campaign attempt, without a second lifecycle',
    async (kind) => {
      const a = await full(),
        p = auxiliary(a, kind === 'failure', kind === 'empty');
      // An unreadable observed keyword cell is optional-evidence failure, not HTTP 500.
      if (kind === 'unparseable') (p.groupResult.rows[0] as Record<string, unknown>).clicks = 'N/A';
      const receipt = (await upload(a, 33, p).expect(200)).body;
      expect(receipt.state).toBe('RUNNING');
      await finish(a, 201);
      const run = await prisma.sourceImportRun.findFirstOrThrow({
        where: { id: a.attemptId, organizationId: ORG },
      });
      expect((run.qualityReport as any).keywordCoverage).toHaveLength(
        kind === 'failure' || kind === 'unparseable' ? 0 : 1,
      );
      expect(
        await prisma.channelAdTargetDailySnapshot.count({
          where: { sourceImportRunId: a.attemptId, targetType: 'keyword', adGroupId: 'g' },
        }),
      ).toBe(kind === 'success' ? 1 : 0);
      expect(await prisma.sourceImportRun.count({ where: { organizationId: ORG } })).toBe(1);
    },
  );
  it('fences organization/token/terminal and persists expiry plus Alert on next admission', async () => {
    const a = (await admit()).body;
    await request(httpUrl)
      .get(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', randomUUID())
      .expect(404);
    await upload({ ...a, attemptToken: randomUUID() }, 0, page([])).expect(409);
    await prisma.sourceImportRun.update({
      where: { id: a.attemptId, organizationId: ORG },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await get(`/attempts/${a.attemptId}`)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    expect(
      (
        await prisma.sourceImportRun.findFirstOrThrow({
          where: { id: a.attemptId, organizationId: ORG },
        })
      ).status,
    ).toBe('running');
    const b = (await admit()).body;
    expect(b.attemptId).not.toBe(a.attemptId);
    expect(
      (
        await prisma.sourceImportRun.findFirstOrThrow({
          where: { id: a.attemptId, organizationId: ORG },
        })
      ).status,
    ).toBe('failed');
    expect(await prisma.alert.count({ where: { organizationId: ORG, status: 'OPEN' } })).toBe(1);
    await expect(prisma.alert.findFirst({
      where: { organizationId: ORG, sourceType: 'coupang_ad_campaign' },
    })).resolves.toMatchObject({ href: '/ad-ops' });
    await upload(a, 0, page([])).expect(409);
  });
  it('atomically rolls back terminal state when Alert persistence fails, then retries the same terminal', async () => {
    const a = (await admit()).body;
    await prisma.$executeRawUnsafe(
      'ALTER TABLE alerts ADD CONSTRAINT campaign_alert_rollback CHECK (false) NOT VALID',
    );
    try {
      await post(a, 'fail', { code: 'PROVIDER_ERROR', message: 'No response' }).expect(500);
      expect(
        (
          await prisma.sourceImportRun.findFirstOrThrow({
            where: { id: a.attemptId, organizationId: ORG },
          })
        ).status,
      ).toBe('running');
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE alerts DROP CONSTRAINT campaign_alert_rollback');
    }
    await post(a, 'fail', { code: 'PROVIDER_ERROR', message: 'No response' }).expect(201);
    const b = (await admit()).body;
    await upload(b, 0, page([])).expect(200);
    await prisma.$executeRawUnsafe(
      "ALTER TABLE alerts ADD CONSTRAINT campaign_resolve_rollback CHECK (status <> 'RESOLVED') NOT VALID",
    );
    try {
      await finish(b, 500);
      expect(
        (
          await prisma.sourceImportRun.findFirstOrThrow({
            where: { id: b.attemptId, organizationId: ORG },
          })
        ).status,
      ).toBe('running');
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE alerts DROP CONSTRAINT campaign_resolve_rollback',
      );
    }
    await finish(b, 201);
    expect(await prisma.alert.count({ where: { organizationId: ORG, status: 'RESOLVED' } })).toBe(
      1,
    );
  });
  it('admits only one concurrent account attempt and does not collide across account generations', async () => {
    const results = await Promise.all([begin(), begin()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const other = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Second', vendorId: 'VENDOR-B' },
    });
    const second = (await admit(randomUUID(), { channelAccountId: other.id })).body;
    await upload(second, 0, { ...page([]), advertiserId: 'VENDOR-B' }).expect(200);
    await finish(second, 201);
  });
  it('continues across KST midnight with the original 31 dates and exact nonrenewable 24-hour deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-06T14:59:00Z'));
      const key = randomUUID(),
        first = (await admit(key)).body;
      expect(first.plan.endDate).toBe('2026-09-05');
      expect(first.expiresAt).toBe('2026-09-07T14:59:00.000Z');
      vi.setSystemTime(new Date('2026-09-06T15:01:00Z'));
      expect((await admit(key)).body).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });
  it('holds a zero closed day after a day with spend until a later sweep sees its spend', async () => {
    const held = await sweep((date, plan) => (date === plan.businessDates[0] ? 0 : 12));
    await finish(held, 201);
    const heldDayBefore = held.plan.businessDates[1];
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: held.attemptId } }))
      .resolves.toMatchObject({ coverageEndDate: new Date(`${heldDayBefore}T00:00:00.000Z`) });
    const heldDays = (await readAdWindowFacts(prisma as never, { organizationId: ORG }, profitCatalogTestReaders(prisma as never).accounts)).days;
    expect(heldDays.at(-1)).toMatchObject({ businessDate: heldDayBefore, spend: 12 });
    expect(heldDays.map((row) => row.businessDate)).not.toContain(held.plan.endDate);
    // Nothing newer can be collected until Coupang reports the closed day.
    expect((await get('/source').expect(200)).body).toMatchObject({
      ready: true,
      latestComplete: { attemptId: held.attemptId },
    });

    const reported = await sweep(() => 12);
    await finish(reported, 201);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: reported.attemptId } }))
      .resolves.toMatchObject({ coverageEndDate: new Date(`${reported.plan.endDate}T00:00:00.000Z`) });
    expect((await readAdWindowFacts(prisma as never, { organizationId: ORG }, profitCatalogTestReaders(prisma as never).accounts)).days.at(-1))
      .toMatchObject({ businessDate: reported.plan.endDate, spend: 12 });
  });
  it('confirms a zero closed day after a zero day, because the account was not advertising', async () => {
    const quiet = await sweep((date, plan) => (plan.businessDates.slice(0, 2).includes(date) ? 0 : 12));
    await finish(quiet, 201);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: quiet.attemptId } }))
      .resolves.toMatchObject({ coverageEndDate: new Date(`${quiet.plan.endDate}T00:00:00.000Z`) });
    expect((await readAdWindowFacts(prisma as never, { organizationId: ORG }, profitCatalogTestReaders(prisma as never).accounts)).days.at(-1))
      .toMatchObject({ businessDate: quiet.plan.endDate, spend: 0 });
  });
  it('holds a one-day manual report of the closed day that shows no spend', async () => {
    const closedDay = businessDateKey(evidenceCutoffDate());
    const targetUrl = `https://advertising.coupang.com/marketing/dashboard/sales#targetDate=${closedDay}`;
    const scope = { captureMode: 'manual_report', period: '1d', startDate: closedDay, endDate: closedDay, targetUrl };
    const range = `/reports?startDate=${closedDay}&endDate=${closedDay}`;
    const zero = (await admit(randomUUID(), scope)).body;
    await upload(zero, 0, manualReport('1d', closedDay, closedDay, targetUrl, false, 0)).expect(200);
    await finish(zero, 201);
    expect((await get(range).expect(200)).body.reports).toEqual([]);

    const spent = (await admit(randomUUID(), scope)).body;
    await upload(spent, 0, manualReport('1d', closedDay, closedDay, targetUrl, false, 500)).expect(200);
    await finish(spent, 201);
    expect((await get(range).expect(200)).body.reports).toMatchObject([{ attemptId: spent.attemptId }]);
  });
  it('does not let a detail-backed OFF campaign downgrade to metadata instead of collecting its dates', async () => {
    const a = (await admit()).body;
    await upload(a, 0, page()).expect(200);
    const result = (
      await upload(
        a,
        1,
        resolve('metadata', '123', {
          ...payload(a.plan.endDate),
          campaignReportScope: 'single_campaign_metadata_raw',
        }),
      ).expect(200)
    ).body;
    expect(result).toMatchObject({
      state: 'FAILED',
      errorCode: 'CAMPAIGN_DETAIL_COVERAGE_REQUIRED',
    });
  });
  it('treats explicit user cancellation as fenced failure without creating or resolving an Alert', async () => {
    const a = (await admit()).body;
    await post(a, 'fail', { code: 'USER_CANCELLED', message: 'Stopped by user' }).expect(201);
    expect((await get(`/attempts/${a.attemptId}`)).body.state).toBe('FAILED');
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(0);
  });
  const cancel = (id: string, organizationId = ORG) =>
    request(httpUrl).post(`${base}/attempts/${id}/cancel`).set('x-test-org', organizationId);
  it('stops a running attempt for an operator without its token or an Alert, then admits the next begin at once', async () => {
    const a = (await admit()).body;
    await cancel(a.attemptId, randomUUID()).expect(404);
    const keyword = await prisma.sourceImportRun.create({
      data: { organizationId: ORG, sourceType: 'coupang_ad_keyword', channelAccountId: accountId },
    });
    await cancel(keyword.id).expect(404);
    const stopped = (await cancel(a.attemptId).expect(200)).body;
    expect(stopped).toMatchObject({
      attemptId: a.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect(stopped).not.toHaveProperty('attemptToken');
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(0);
    await upload(a, 0, page([])).expect(409);
    expect((await cancel(a.attemptId).expect(200)).body).toEqual(stopped);
    const next = (await admit()).body;
    expect(next).toMatchObject({ state: 'RUNNING' });
    expect(next.attemptId).not.toBe(a.attemptId);
  });
  it('settles an operator stop after the lease passed as expiry with its Alert and leaves terminal attempts unchanged', async () => {
    const expired = (await admit()).body;
    await prisma.sourceImportRun.update({
      where: { id: expired.attemptId, organizationId: ORG },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await cancel(expired.attemptId).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    await expect(
      prisma.sourceImportRun.findFirstOrThrow({ where: { id: expired.attemptId, organizationId: ORG } }),
    ).resolves.toMatchObject({ status: 'failed', errorCode: 'ATTEMPT_EXPIRED' });
    expect(await prisma.alert.count({ where: { organizationId: ORG, status: 'OPEN' } })).toBe(1);

    const failed = (await admit()).body;
    await post(failed, 'fail', { code: 'PROVIDER_ERROR', message: 'No response' }).expect(201);
    const failedView = (await get(`/attempts/${failed.attemptId}`).expect(200)).body;
    expect((await cancel(failed.attemptId).expect(200)).body).toEqual(failedView);

    const completed = await full();
    await finish(completed);
    const completeView = (await get(`/attempts/${completed.attemptId}`).expect(200)).body;
    expect(completeView.state).toBe('COMPLETE');
    expect((await cancel(completed.attemptId).expect(200)).body).toEqual(completeView);
  });
  it('rechecks account identity at final publication and never promotes staged facts after drift', async () => {
    const a = await full();
    await prisma.channelAccount.update({
      where: { id: accountId, organizationId: ORG },
      data: { vendorId: 'OTHER' },
    });
    expect((await finish(a, 201)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ADVERTISER_IDENTITY_MISMATCH',
    });
    expect((await get('/source')).body.latestComplete).toBeNull();
    expect(
      await prisma.channelAdTargetDailySnapshot.count({
        where: { sourceImportRunId: a.attemptId },
      }),
    ).toBe(31);
  });
  it('reads attempt and COMPLETE status from one PostgreSQL snapshot during terminal publication', async () => {
    const a = (await admit()).body;
    await upload(a, 0, page([])).expect(200);
    let sawLatest!: () => void, published!: () => void;
    const latestRead = new Promise<void>((resolve) => {
      sawLatest = resolve;
    });
    const committed = new Promise<void>((resolve) => {
      published = resolve;
    });
    const readClient = prisma.$extends({
      query: {
        sourceImportRun: {
          async findMany({ args, query }) {
            const rows = await query(args);
            sawLatest();
            await committed;
            return rows;
          },
        },
      },
    });
    const reading = new AdCampaignSourceRepository(channelFactTestPorts(readClient as never).accounts, channelFactTestPorts(readClient as never).listings, readClient as never, alerts).source(
      ORG,
      accountId,
    );
    await latestRead;
    try {
      await finish(a, 201);
    } finally {
      published();
    }
    expect(await reading).toMatchObject({
      ready: false,
      latestAttempt: { state: 'RUNNING' },
      latestComplete: null,
    });
    expect((await get('/source')).body).toMatchObject({
      ready: true,
      latestComplete: { attemptId: a.attemptId },
    });
  });
  it('publishes displayed 7d and exact 1d reports as one private receipt without daily distribution', async () => {
    const sevenDayUrl = 'https://advertising.coupang.com/marketing/dashboard/sales';
    const sevenDay = (await admit(randomUUID(), {
      captureMode: 'manual_report',
      period: '7d',
      startDate: '2026-08-30',
      endDate: '2026-09-05',
      targetUrl: sevenDayUrl,
    })).body;
    expect(sevenDay.plan).toMatchObject({
      captureMode: 'manual_report',
      period: '7d',
      startDate: '2026-08-30',
      endDate: '2026-09-05',
      businessDates: ['2026-09-05'],
      targetUrl: sevenDayUrl,
    });
    await upload(sevenDay, 0, manualReport('7d', '2026-08-30', '2026-09-05', sevenDayUrl)).expect(200);
    await finish(sevenDay, 201);
    expect(
      await prisma.channelAdTargetDailySnapshot.count({ where: { sourceImportRunId: sevenDay.attemptId } }),
    ).toBe(0);
    expect((await get('/reports?startDate=2026-08-30&endDate=2026-09-05')).body).toMatchObject({
      reports: [{ attemptId: sevenDay.attemptId, plan: { period: '7d' }, payload: { startDate: '2026-08-30', endDate: '2026-09-05' } }],
    });
    expect((await get('/reports?startDate=2026-08-29&endDate=2026-09-04')).body.reports).toEqual([]);

    const exactUrl = `${sevenDayUrl}#targetDate=2026-09-05`;
    const exactDay = (await admit(randomUUID(), {
      captureMode: 'manual_report',
      period: '1d',
      startDate: '2026-09-05',
      endDate: '2026-09-05',
      targetUrl: exactUrl,
    })).body;
    await upload(exactDay, 0, manualReport('1d', '2026-09-05', '2026-09-05', exactUrl)).expect(200);
    await finish(exactDay, 201);
    expect((await get('/reports?startDate=2026-09-05&endDate=2026-09-05')).body).toMatchObject({
      reports: [{ attemptId: exactDay.attemptId, plan: { period: '1d', targetUrl: exactUrl } }],
    });
    await expect(
      begin(randomUUID(), {
        captureMode: 'manual_report',
        period: '1d',
        startDate: '2026-09-05',
        endDate: '2026-09-05',
        targetUrl: `${sevenDayUrl}#targetDate=2026-09-04`,
      }),
    ).resolves.toMatchObject({ status: 400 });
  });

  it('keeps sweep campaign/action consumers authoritative while exact 7d reads select the latest successful manual report', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-06T14:59:00.000Z'));

    const sweepId = randomUUID();
    await prisma.sourceImportRun.create({
      data: {
        id: sweepId,
        organizationId: ORG,
        channelAccountId: accountId,
        sourceType: 'coupang_ad_campaign',
        parserVersion: 'ad-campaign-v1',
        status: 'completed',
        importedAt: new Date('2026-09-06T00:00:00.000Z'),
        freshnessGeneration: 1n,
        coverageStartDate: new Date('2026-08-06T00:00:00.000Z'),
        coverageEndDate: new Date('2026-09-05T00:00:00.000Z'),
        plan: {
          sourceType: 'coupang_ad_campaign',
          parserVersion: 'ad-campaign-v1',
          captureMode: 'campaign_sweep',
          channelAccountId: accountId,
          expectedAdvertiserId: 'VENDOR-A',
          startDate: '2026-08-06',
          endDate: '2026-09-05',
          businessDates: Array.from({ length: 31 }, (_, index) =>
            new Date(Date.parse('2026-09-05') - index * 86_400_000)
              .toISOString()
              .slice(0, 10),
          ),
        },
        qualityReport: {
          campaignDescriptors: [{
            campaignId: 'sweep-campaign',
            campaignIdentity: 'campaign:sweep-campaign',
            campaignName: 'Sweep campaign',
            status: '운영중',
            onOff: 'ON',
            mode: 'daily',
          }],
        },
      },
    });
    await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        sourceImportRunId: sweepId,
        channel: 'coupang',
        businessDate: new Date('2026-09-05T00:00:00.000Z'),
        targetType: 'campaign',
        targetKey: 'sweep-campaign',
        campaignId: 'sweep-campaign',
        campaignIdentity: 'campaign:sweep-campaign',
        campaignName: 'Sweep campaign',
        spend: 77,
        revenue: 154,
        impressions: 100,
        clicks: 10,
        conversions: 0,
        orders: 0,
        metaJson: {
          'advertising.campaign.target': {
            granularity: 'campaign',
            conversionsObserved: false,
          },
        },
      },
    });
    const legacySweepId = randomUUID();
    await prisma.sourceImportRun.create({
      data: {
        id: legacySweepId,
        organizationId: ORG,
        channelAccountId: accountId,
        sourceType: 'coupang_ad_campaign',
        parserVersion: 'ad-campaign-v1',
        status: 'completed',
        importedAt: new Date('2026-09-06T00:00:00.000Z'),
        freshnessGeneration: 2n,
        qualityReport: { campaignDescriptors: [] },
      },
    });
    await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        sourceImportRunId: legacySweepId,
        channel: 'coupang',
        businessDate: new Date('2026-09-05T00:00:00.000Z'),
        targetType: 'campaign',
        targetKey: 'legacy-sweep',
        campaignId: 'legacy-sweep',
        campaignIdentity: 'campaign:legacy-sweep',
        campaignName: 'Legacy sweep without mode',
        spend: 999,
        revenue: 1998,
        impressions: 100,
        clicks: 10,
        conversions: 0,
        orders: 0,
        metaJson: {
          'advertising.campaign.target': {
            granularity: 'campaign',
            conversionsObserved: false,
          },
        },
      },
    });

    const firstManual = (await admit(randomUUID(), {
      captureMode: 'manual_report',
      period: '7d',
      startDate: '2026-08-30',
      endDate: '2026-09-05',
      targetUrl: 'https://advertising.coupang.com/marketing/dashboard/sales',
    })).body;
    await upload(
      firstManual,
      0,
      manualReport('7d', '2026-08-30', '2026-09-05', firstManual.plan.targetUrl),
    ).expect(200);
    await finish(firstManual, 201);

    const campaignReader = new AdCampaignRepositoryAdapter(prisma as never, profitCatalogTestReaders(prisma as never).accounts);
    const actionReader = new AdActionRepositoryAdapter(channelFactTestPorts(prisma as never).listings, channelFactTestPorts(prisma as never).recipes, prisma as never, {} as never, profitCatalogTestReaders(prisma as never).accounts);
    expect((await campaignReader.findCampaignSnapshot(ORG, '7d')).rollups).toMatchObject([
      { spend: 77 },
    ]);
    expect((await actionReader.findLatestTargetRows(ORG)).map((row) => row.spend)).toContain(77);
    expect((await get('/reports?startDate=2026-08-30&endDate=2026-09-05')).body.reports).toMatchObject([
      { attemptId: firstManual.attemptId, payload: { data: [{ raw: 'displayed-range' }] } },
    ]);

    const failedManual = (await admit(randomUUID(), {
      captureMode: 'manual_report',
      period: '7d',
      startDate: '2026-08-30',
      endDate: '2026-09-05',
      targetUrl: firstManual.plan.targetUrl,
    })).body;
    await post(failedManual, 'fail', {
      code: 'NETWORK',
      message: 'Provider unavailable.',
    }).expect(201);
    expect((await get('/reports?startDate=2026-08-30&endDate=2026-09-05')).body.reports).toMatchObject([
      { attemptId: firstManual.attemptId },
    ]);

    const emptyManual = (await admit(randomUUID(), {
      captureMode: 'manual_report',
      period: '7d',
      startDate: '2026-08-30',
      endDate: '2026-09-05',
      targetUrl: firstManual.plan.targetUrl,
    })).body;
    await upload(
      emptyManual,
      0,
      manualReport('7d', '2026-08-30', '2026-09-05', emptyManual.plan.targetUrl, true),
    ).expect(200);
    await finish(emptyManual, 201);
    expect((await get('/reports?startDate=2026-08-30&endDate=2026-09-05')).body.reports).toMatchObject([
      { attemptId: emptyManual.attemptId, payload: { data: [] } },
    ]);
    expect((await campaignReader.findCampaignSnapshot(ORG, '7d')).rollups).toMatchObject([
      { spend: 77 },
    ]);
    expect((await actionReader.findLatestTargetRows(ORG)).map((row) => row.spend)).toContain(77);
  });

  const manualReportBegin = {
    captureMode: 'manual_report',
    period: '7d',
    startDate: '2026-08-30',
    endDate: '2026-09-05',
    targetUrl: 'https://advertising.coupang.com/marketing/dashboard/sales',
  };
  const sourceStatus = async () =>
    AdCampaignSourceStatusSchema.parse((await get('/source').expect(200)).body);

  it('reads the live attempt of any capture mode beside the sweep status', async () => {
    expect(await sourceStatus()).toMatchObject({
      latestAttempt: null,
      activeAttempt: null,
      latestManualReport: null,
    });

    const manual = (await admit(randomUUID(), manualReportBegin)).body;
    expect(await sourceStatus()).toMatchObject({
      latestAttempt: null,
      latestComplete: null,
      activeAttempt: {
        attemptId: manual.attemptId,
        state: 'RUNNING',
        plan: { captureMode: 'manual_report' },
      },
    });
    await cancel(manual.attemptId).expect(200);
    expect((await sourceStatus()).activeAttempt).toBeNull();

    const sweep = (await admit()).body;
    expect(await sourceStatus()).toMatchObject({
      latestAttempt: { attemptId: sweep.attemptId, state: 'RUNNING' },
      activeAttempt: { attemptId: sweep.attemptId, plan: { captureMode: 'campaign_sweep' } },
    });
    await prisma.sourceImportRun.update({
      where: { id: sweep.attemptId, organizationId: ORG },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await sourceStatus()).toMatchObject({
      latestAttempt: { attemptId: sweep.attemptId, state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' },
      activeAttempt: null,
    });
  });

  it('reads the newest manual report in any state beside the sweep status', async () => {
    const published = (await admit(randomUUID(), manualReportBegin)).body;
    expect((await sourceStatus()).latestManualReport).toMatchObject({
      attemptId: published.attemptId,
      state: 'RUNNING',
    });
    await upload(
      published,
      0,
      manualReport('7d', '2026-08-30', '2026-09-05', manualReportBegin.targetUrl),
    ).expect(200);
    await finish(published, 201);
    const failed = (await admit(randomUUID(), manualReportBegin)).body;
    await post(failed, 'fail', { code: 'NETWORK', message: 'Provider unavailable.' }).expect(201);
    const sweep = await full();
    await finish(sweep);

    expect(await sourceStatus()).toMatchObject({
      latestAttempt: { attemptId: sweep.attemptId, state: 'COMPLETE' },
      latestComplete: { attemptId: sweep.attemptId },
      activeAttempt: null,
      latestManualReport: {
        attemptId: failed.attemptId,
        state: 'FAILED',
        errorCode: 'NETWORK',
        plan: { captureMode: 'manual_report', period: '7d' },
      },
    });
  });

});
