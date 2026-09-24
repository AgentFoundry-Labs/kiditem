import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { json } from 'express';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { AdKeywordSourceController } from '../adapter/in/http/ad-keyword-source.controller';
import { AdKeywordSourceRepository } from '../adapter/out/repository/ad-keyword-source.repository';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';

const base = '/api/ads/ad-keywords';
describe('Ad keyword source incoming HTTP + disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let accountId: string;
  let owner: AdKeywordSourceRepository;
  let alerts: SourceFailureAlerts;
  const chunkReads: Prisma.ChannelScrapeChunkFindManyArgs[] = [];
  const exactChunkReads: Prisma.ChannelScrapeChunkFindFirstArgs[] = [];
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    const observed = prisma.$extends({
      query: {
        channelScrapeChunk: {
          findFirst({ args, query }) {
            exactChunkReads.push(args);
            return query(args);
          },
          findMany({ args, query }) {
            chunkReads.push(args);
            return query(args);
          },
        },
      },
    });
    owner = new AdKeywordSourceRepository(channelFactTestPorts(observed as never).accounts, channelFactTestPorts(observed as never).listings, observed as never, alerts);
    const module = await Test.createTestingModule({
      controllers: [AdKeywordSourceController],
      providers: [{ provide: AdKeywordSourceRepository, useValue: owner }],
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
    // Keep one real listener for the whole fixture. Passing an unbound
    // HttpServer to supertest makes each request lazily listen/close it; the
    // concurrent admission and rendezvous tests can then race that lifecycle
    // rather than exercising the source owner.
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
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
  const roster = () => ({
    advertiserId: 'VENDOR-A',
    campaigns: [
      {
        campaignId: '104640375',
        name: '광고',
        isActive: true,
        totalAdCount: 2,
        groupsArrayObserved: true,
        groups: [{ adGroupId: '10', adGroupName: 'MBTI젤리' }],
      },
    ],
    pages: [
      {
        page: 0,
        campaignsArrayObserved: true,
        hasNextPage: false,
        campaignCount: 1,
      },
    ],
  });
  const groupPlan = () => ({
    advertiserId: 'VENDOR-A',
    adsArrayObserved: true,
    adGroupName: 'MBTI젤리',
    enumeratedAdCount: 2,
    ads: [
      { adId: '1', vendorItemId: 'ITEM-1', itemName: '문어', isActive: true },
      {
        adId: '2',
        vendorItemId: 'UNMATCHED',
        itemName: '미매칭',
        isActive: true,
      },
    ],
  });
  const groupResult = () => ({
    advertiserId: 'VENDOR-A',
    capturedAt: new Date().toISOString(),
    ads: [
      { adId: '1', metricsOk: true, registeredOk: true },
      { adId: '2', metricsOk: true, registeredOk: true },
    ],
    rows: [
      {
        adId: '1',
        externalOptionId: 'ITEM-1',
        campaignId: '104640375',
        campaignName: '광고',
        adGroup: 'MBTI젤리',
        keyword: '버블문어',
        origin: 'registered',
        impressions: 3,
        spend: 10,
        status: 'ACCEPTED',
        currentBid: 40,
      },
      {
        adId: '2',
        externalOptionId: 'UNMATCHED',
        campaignId: '104640375',
        campaignName: '광고',
        adGroup: 'MBTI젤리',
        keyword: '버블문어',
        origin: 'smart_targeting',
        impressions: 7,
        spend: 20,
        status: null,
        currentBid: null,
      },
    ],
  });
  const emptyRoster = () => ({
    advertiserId: 'VENDOR-A',
    campaigns: [],
    pages: [
      {
        page: 0,
        campaignsArrayObserved: true,
        hasNextPage: false,
        campaignCount: 0,
      },
    ],
  });
  const finish = async (attempt: { attemptId: string; attemptToken: string }) => {
    const manifestChecksum = (await get(`/attempts/${attempt.attemptId}/control`).expect(200)).body
      .manifestChecksum;
    return post(attempt, 'complete', { manifestChecksum });
  };
  const stage = async () => {
    const attempt = (await admit()).body;
    await put(attempt, 'roster', roster()).expect(200);
    await put(attempt, 'groups/0/plan', groupPlan()).expect(200);
    await put(attempt, 'groups/0/result', groupResult()).expect(200);
    return attempt;
  };

  it('returns a safe HTTP begin receipt and reserves token and queue for explicit control', async () => {
    const key = randomUUID();
    const receipt = (await begin(key).expect(201)).body;
    for (const field of ['attemptToken', 'queue', 'roster', 'receipts'])
      expect(receipt).not.toHaveProperty(field);
    const control = (await get(`/attempts/${receipt.attemptId}/control`).expect(200)).body;
    expect(control).toMatchObject({ ...receipt, queue: [], roster: null });
    expect(control.attemptToken).toMatch(/^[0-9a-f-]{36}$/);
    expect((await begin(key).expect(201)).body).toEqual(receipt);
  });

  it('keeps polling and receipt ACKs metadata-only while explicit control loads frozen group plans', async () => {
    const attempt = (await admit()).body;
    const twoGroups = roster();
    twoGroups.campaigns[0].groups.push({
      adGroupId: '20',
      adGroupName: 'MBTI젤리',
    });
    await put(attempt, 'roster', twoGroups).expect(200);
    await put(attempt, 'groups/0/plan', groupPlan()).expect(200);
    await put(attempt, 'groups/1/plan', groupPlan()).expect(200);
    chunkReads.length = 0;
    exactChunkReads.length = 0;
    await get(`/attempts/${attempt.attemptId}`).expect(200);
    await get('/source').expect(200);
    await put(attempt, 'groups/0/plan', groupPlan()).expect(200);
    await put(attempt, 'groups/1/result', groupResult()).expect(200);
    await put(attempt, 'groups/0/result', groupResult()).expect(200);
    const receipt = (await get(`/attempts/${attempt.attemptId}`).expect(200)).body;
    // Payload reads in safe paths are restricted to the roster. Result validation
    // separately reads only its exact group plan, never all accumulated plans.
    expect(chunkReads.filter((args) => args.select?.payload)).toSatisfy(
      (reads: Prisma.ChannelScrapeChunkFindManyArgs[]) =>
        reads.every((args) => args.where?.kind === 'roster'),
    );
    expect(
      exactChunkReads
        .filter((args) => args.where?.kind === 'group_plan')
        .map((args) => args.where?.sequence),
    ).toEqual([1, 0]);
    await post(attempt, 'complete', {
      manifestChecksum: receipt.manifestChecksum,
    }).expect(201);
    chunkReads.length = 0;
    const source = (await get('/source').expect(200)).body;
    expect(source.latestAttempt).toEqual(source.latestComplete);
    expect(chunkReads.filter((args) => args.select?.checksum)).toHaveLength(1);
    chunkReads.length = 0;
    const control = (await get(`/attempts/${attempt.attemptId}/control`).expect(200)).body;
    expect(control.queue[0].plan).toEqual(groupPlan());
    expect(
      chunkReads.some((args) => args.select?.payload && args.where?.kind === 'group_plan'),
    ).toBe(true);
  });

  it('freezes the account/window once and recovers the original permit without renewal or configuration selection', async () => {
    const key = randomUUID();
    const first = await admit(key);
    expect(first.body).toMatchObject({
      state: 'RUNNING',
      channelAccountId: accountId,
      plan: { expectedAdvertiserId: 'VENDOR-A', windowDays: 7 },
      queue: [],
      receipts: [],
    });
    expect(first.body.attemptToken).toMatch(/^[0-9a-f-]{36}$/);
    await prisma.channelAccount.update({
      where: { id: accountId, organizationId: ORG },
      data: { vendorId: 'CHANGED' },
    });
    expect((await admit(key)).body).toEqual(first.body);
    expect((await get(`/attempts/${first.body.attemptId}/control`).expect(200)).body).toEqual(
      first.body,
    );
    expect((await get(`/attempts/${first.body.attemptId}`).expect(200)).body).not.toHaveProperty(
      'attemptToken',
    );
    expect((await begin().expect(409)).body).toMatchObject({
      code: 'ATTEMPT_IN_PROGRESS',
      attemptId: first.body.attemptId,
    });
  });
  it('freezes the provider-backed roster queue in existing active/count/key order and replays only exact receipts', async () => {
    const attempt = (await admit()).body;
    const roster = {
      advertiserId: 'VENDOR-A',
      campaigns: [
        {
          campaignId: '1',
          name: 'inactive',
          isActive: false,
          totalAdCount: 1,
          groupsArrayObserved: true,
          groups: [{ adGroupId: '10', adGroupName: 'inactive group' }],
        },
        {
          campaignId: '2',
          name: 'active',
          isActive: true,
          totalAdCount: 10,
          groupsArrayObserved: true,
          groups: [{ adGroupId: '20', adGroupName: 'active group' }],
        },
      ],
      pages: [
        {
          page: 0,
          campaignsArrayObserved: true,
          hasNextPage: false,
          campaignCount: 2,
        },
      ],
    };
    const first = (await put(attempt, 'roster', roster).expect(200)).body;
    expect(first).toMatchObject({
      state: 'RUNNING',
      groupCount: 2,
      completedGroupCount: 0,
    });
    const control = (await get(`/attempts/${attempt.attemptId}/control`).expect(200)).body;
    expect(control.queue.map((unit: { key: string }) => unit.key)).toEqual(['2:20', '1:10']);
    expect(control.queue.every((unit: { plan: unknown }) => unit.plan === null)).toBe(true);
    expect(control.receipts).toHaveLength(1);
    expect((await put(attempt, 'roster', roster).expect(200)).body).toEqual(first);
    await put(attempt, 'roster', {
      ...roster,
      campaigns: roster.campaigns.slice(0, 1),
    }).expect(409);
    expect((await get(`/attempts/${attempt.attemptId}/control`)).body).toEqual(control);
  });
  it('stages normalized keyword facts privately and publishes only after complete exact group coverage', async () => {
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        externalId: 'product',
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: 'ITEM-1',
      },
    });
    const attempt = (await admit()).body;
    await put(attempt, 'roster', roster()).expect(200);
    await put(attempt, 'groups/0/plan', groupPlan()).expect(200);
    const result = groupResult();
    const stage = (await put(attempt, 'groups/0/result', result).expect(200)).body;
    expect(stage).toMatchObject({
      state: 'RUNNING',
      rowCount: 1,
      completedGroupCount: 1,
    });
    expect(await owner.readComplete(ORG, { channelAccountId: accountId })).toEqual({
      attempt: null,
      rows: [],
    });
    expect((await put(attempt, 'groups/0/result', result).expect(200)).body).toEqual(stage);
    const control = (await get(`/attempts/${attempt.attemptId}/control`)).body;
    expect(control.queue[0]).toMatchObject({
      plan: groupPlan(),
      resultComplete: true,
    });
    const completed = (
      await post(attempt, 'complete', {
        manifestChecksum: control.manifestChecksum,
      }).expect(201)
    ).body;
    expect(completed).toMatchObject({ state: 'COMPLETE', rowCount: 1 });
    const published = await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } });
    const rosterReceipt = await prisma.channelScrapeChunk.findFirstOrThrow({
      where: { organizationId: ORG, kind: 'roster', scrapeRun: { sourceImportRunId: attempt.attemptId } },
    });
    expect(published.qualityReport).toMatchObject({
      rosterCapturedAt: rosterReceipt.createdAt.toISOString(),
      keywordCoverage: [{
        campaignIdentity: 'campaign:104640375', adGroupId: '10',
        capturedAt: result.capturedAt, businessDate: control.plan.endDate,
      }],
    });
    const snapshot = await owner.readComplete(ORG, {
      channelAccountId: accountId,
    });
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({
      targetType: 'keyword',
      keyword: '버블문어',
      spend: 30,
      impressions: 10,
      status: 'ACCEPTED',
      currentBid: 40,
      externalOptionId: null,
      listingId: null,
      listingOptionId: null,
      metaJson: { data: { origin: 'registered', windowDays: 7, adId: '1' } },
    });
    expect(
      (
        await post(attempt, 'complete', {
          manifestChecksum: control.manifestChecksum,
        }).expect(201)
      ).body,
    ).toEqual(completed);
  });
  it('reads source status independently of local sessions and keeps the previous COMPLETE after a failed refresh', async () => {
    expect((await get('/source').expect(200)).body).toMatchObject({
      ready: false,
      latestAttempt: null,
      latestComplete: null,
    });
    const first = (await admit()).body;
    expect((await get('/source').expect(200)).body).toMatchObject({
      ready: false,
      latestAttempt: { attemptId: first.attemptId, state: 'RUNNING' },
    });
    await put(first, 'roster', {
      advertiserId: 'VENDOR-A',
      campaigns: [],
      pages: [
        {
          page: 0,
          campaignsArrayObserved: true,
          hasNextPage: false,
          campaignCount: 0,
        },
      ],
    }).expect(200);
    const manifest = (await get(`/attempts/${first.attemptId}/control`)).body.manifestChecksum;
    await post(first, 'complete', { manifestChecksum: manifest }).expect(201);
    expect((await get('/source').expect(200)).body).toMatchObject({
      ready: true,
      latestComplete: { attemptId: first.attemptId, rowCount: 0 },
    });
    const next = (await admit()).body;
    const failed = (
      await post(next, 'fail', {
        code: 'PROVIDER_FAILURE',
        message: 'Provider unavailable',
      }).expect(201)
    ).body;
    expect(failed).toMatchObject({
      state: 'FAILED',
      errorCode: 'PROVIDER_FAILURE',
    });
    const source = (await get('/source').expect(200)).body;
    expect(source).toMatchObject({
      ready: true,
      latestAttempt: { attemptId: next.attemptId, state: 'FAILED' },
      latestComplete: { attemptId: first.attemptId, state: 'COMPLETE' },
    });
    await expect(prisma.alert.findFirst({
      where: { organizationId: ORG, sourceType: 'coupang_ad_keyword', attemptId: next.attemptId },
    })).resolves.toMatchObject({ href: '/ad-ops' });
    expect(JSON.stringify(source)).not.toContain('attemptToken');
    expect(
      (
        await post(next, 'fail', {
          code: 'PROVIDER_FAILURE',
          message: 'Provider unavailable',
        }).expect(201)
      ).body,
    ).toEqual(failed);
  });
  it.each([false, true])(
    'user cancellation does not create or reactivate an Alert (prior failure: %s)',
    async (priorFailure) => {
      if (priorFailure) {
        const previous = (await admit()).body;
        await post(previous, 'fail', {
          code: 'PROVIDER_FAILURE',
          message: 'Provider unavailable',
        }).expect(201);
        const [alert] = await alerts.list(ORG);
        await alerts.dismiss(alert.id, ORG);
      }
      const before = await alerts.list(ORG);
      const attempt = (await admit()).body;
      const payload = {
        code: 'USER_CANCELLED',
        message: '사용자가 수집을 중단했습니다.',
      };
      const cancelled = (await post(attempt, 'fail', payload).expect(201)).body;
      expect(cancelled).toMatchObject({
        state: 'FAILED',
        errorCode: 'USER_CANCELLED',
      });
      expect((await post(attempt, 'fail', payload).expect(201)).body).toEqual(cancelled);
      expect((await get('/source').expect(200)).body.latestAttempt).toMatchObject({
        attemptId: attempt.attemptId,
        state: 'FAILED',
        errorCode: 'USER_CANCELLED',
      });
      expect(await alerts.list(ORG)).toEqual(before);
    },
  );
  it('replays an identity-invalid terminal receipt exactly but rejects a conflicting terminal submission', async () => {
    const attempt = (await admit()).body;
    const invalid = { ...roster(), advertiserId: null };
    const failed = (await put(attempt, 'roster', invalid).expect(200)).body;
    expect(failed).toMatchObject({
      state: 'FAILED',
      errorCode: 'ADVERTISER_IDENTITY_MISMATCH',
    });
    expect((await put(attempt, 'roster', invalid).expect(200)).body).toEqual(failed);
    await put(attempt, 'roster', roster()).expect(409);
    expect(await owner.readComplete(ORG, { channelAccountId: accountId })).toEqual({
      attempt: null,
      rows: [],
    });
  });
  it('keeps independent group contributions and merges equal public target keys in frozen queue order', async () => {
    const attempt = (await admit()).body;
    const input = roster();
    input.campaigns[0].groups.push({
      adGroupId: '20',
      adGroupName: 'MBTI젤리',
    });
    await put(attempt, 'roster', input).expect(200);
    for (const sequence of [1, 0]) {
      const plan = groupPlan();
      plan.ads = [plan.ads[sequence]];
      plan.enumeratedAdCount = 1;
      const result = groupResult();
      result.ads = [result.ads[sequence]];
      result.rows = [result.rows[sequence]];
      await put(attempt, `groups/${sequence}/plan`, plan).expect(200);
      await put(attempt, `groups/${sequence}/result`, result).expect(200);
      if (sequence === 1) expect((await finish(attempt)).status).toBe(409);
    }
    expect((await finish(attempt)).body).toMatchObject({
      state: 'COMPLETE',
      rowCount: 2,
      completedGroupCount: 2,
    });
    const snapshot = await owner.readComplete(ORG, {
      channelAccountId: accountId,
    });
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({
      spend: 30,
      impressions: 10,
      status: 'ACCEPTED',
      currentBid: 40,
      externalOptionId: null,
      metaJson: { data: { origin: 'registered', adId: '1' } },
    });
  });
  it('preserves the previous complete during staging, then an explicit empty COMPLETE hides it before period filtering', async () => {
    const first = await stage();
    await finish(first);
    const baseline = await owner.readComplete(ORG, {
      channelAccountId: accountId,
    });
    const next = (await admit()).body;
    await put(next, 'roster', emptyRoster()).expect(200);
    expect(await owner.readComplete(ORG, { channelAccountId: accountId })).toEqual(baseline);
    expect((await finish(next)).body).toMatchObject({
      state: 'COMPLETE',
      rowCount: 0,
    });
    expect((await owner.readComplete(ORG, { channelAccountId: accountId })).rows).toEqual([]);
    expect(
      (
        await owner.readComplete(ORG, {
          channelAccountId: accountId,
          from: new Date(first.plan.startDate),
          to: new Date(first.plan.endDate),
        })
      ).rows,
    ).toEqual([]);
    expect((await get(`/attempts/${first.attemptId}`)).body).toMatchObject({
      state: 'COMPLETE',
      rowCount: 1,
    });
  });
  it('requires a group result for a confirmed-empty lazy ad plan', async () => {
    const attempt = (await admit()).body;
    await put(attempt, 'roster', roster()).expect(200);
    const plan = { ...groupPlan(), enumeratedAdCount: 0, ads: [] };
    await put(attempt, 'groups/0/plan', plan).expect(200);
    expect((await finish(attempt)).status).toBe(409);
    await put(attempt, 'groups/0/result', {
      ...groupResult(),
      ads: [],
      rows: [],
    }).expect(200);
    expect((await finish(attempt)).body).toMatchObject({
      state: 'COMPLETE',
      rowCount: 0,
      completedGroupCount: 1,
    });
  });
  it.each(['missing_array', 'missing_groups', 'missing_pagination', 'cap', 'identity'] as const)(
    'does not turn %s roster evidence into a complete roster',
    async (kind) => {
      const attempt = (await admit()).body;
      const input: Record<string, unknown> = roster();
      if (kind === 'identity') input.advertiserId = 'WRONG';
      if (kind === 'missing_groups')
        input.campaigns = [{ ...roster().campaigns[0], groups: [], groupsArrayObserved: false }];
      if (kind === 'missing_array')
        input.pages = [{ ...roster().pages[0], campaignsArrayObserved: false }];
      if (kind === 'missing_pagination')
        input.pages = [{ ...roster().pages[0], hasNextPage: null }];
      if (kind === 'cap')
        input.pages = Array.from({ length: 20 }, (_, page) => ({
          page,
          campaignsArrayObserved: true,
          hasNextPage: true,
          campaignCount: page === 0 ? 1 : 0,
        }));
      expect((await put(attempt, 'roster', input).expect(200)).body.state).toBe('FAILED');
      expect((await owner.readComplete(ORG, { channelAccountId: accountId })).rows).toEqual([]);
      expect(await alerts.list(ORG)).toMatchObject([
        { status: 'OPEN', attemptId: attempt.attemptId },
      ]);
    },
  );
  it.each(['truncated', 'missing_array'] as const)(
    'rejects %s group enumeration instead of freezing an empty/smaller plan',
    async (kind) => {
      const attempt = (await admit()).body;
      await put(attempt, 'roster', roster()).expect(200);
      const input = groupPlan();
      if (kind === 'truncated') input.enumeratedAdCount = 61;
      else input.adsArrayObserved = false;
      expect((await put(attempt, 'groups/0/plan', input).expect(200)).body).toMatchObject({
        state: 'FAILED',
        errorCode: 'INCOMPLETE_KEYWORD_GROUP',
      });
    },
  );
  it.each(['metrics', 'registered', 'coverage', 'identity'] as const)(
    'rejects %s group result failure without promoting rows',
    async (kind) => {
      const attempt = (await admit()).body;
      await put(attempt, 'roster', roster()).expect(200);
      await put(attempt, 'groups/0/plan', groupPlan()).expect(200);
      const input = groupResult();
      if (kind === 'metrics') input.ads[0].metricsOk = false;
      if (kind === 'registered') input.ads[0].registeredOk = false;
      if (kind === 'coverage') input.ads.pop();
      if (kind === 'identity') input.advertiserId = 'WRONG';
      expect((await put(attempt, 'groups/0/result', input).expect(200)).body.state).toBe('FAILED');
      expect((await owner.readComplete(ORG, { channelAccountId: accountId })).rows).toEqual([]);
    },
  );
  it('fails the attempt with AD_METRIC_UNPARSEABLE for an unreadable observed metric cell instead of HTTP 500', async () => {
    const attempt = (await admit()).body;
    await put(attempt, 'roster', roster()).expect(200);
    await put(attempt, 'groups/0/plan', groupPlan()).expect(200);
    const input = groupResult();
    (input.rows[0] as Record<string, unknown>).clicks = 'N/A';
    expect((await put(attempt, 'groups/0/result', input).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'AD_METRIC_UNPARSEABLE',
    });
    expect(
      await prisma.channelAdTargetDailySnapshot.count({
        where: { organizationId: ORG, sourceImportRunId: attempt.attemptId },
      }),
    ).toBe(0);
    expect(await alerts.list(ORG)).toMatchObject([
      { status: 'OPEN', attemptId: attempt.attemptId },
    ]);
    expect((await put(attempt, 'groups/0/result', input).expect(200)).body.state).toBe('FAILED');
  });
  it('fences organization, token, immutable group receipts and changed begin input', async () => {
    const attempt = (await admit()).body;
    await request(httpUrl)
      .get(`${base}/attempts/${attempt.attemptId}/control`)
      .set('x-test-org', randomUUID())
      .expect(404);
    await request(httpUrl)
      .put(`${base}/attempts/${attempt.attemptId}/roster`)
      .set('x-test-org', randomUUID())
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send(roster())
      .expect(404);
    await put({ ...attempt, attemptToken: randomUUID() }, 'roster', roster()).expect(409);
    await put(attempt, 'roster', roster()).expect(200);
    await put(attempt, 'groups/0/plan', groupPlan()).expect(200);
    await put(attempt, 'groups/0/plan', { ...groupPlan(), ads: [] }).expect(409);
    const result = groupResult();
    await put(attempt, 'groups/0/result', result).expect(200);
    await put(attempt, 'groups/0/result', { ...result, rows: [] }).expect(409);
    await post(attempt, 'complete', {
      manifestChecksum: '0'.repeat(64),
    }).expect(409);
    await finish(attempt);
    await put(attempt, 'groups/0/result', result).expect(409);
  });
  it('keeps the original day and fixed expiry through midnight manual resume', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-06T14:30:00Z'));
      const key = randomUUID();
      const first = (await admit(key)).body;
      expect(first.plan).toMatchObject({
        startDate: '2026-08-30',
        endDate: '2026-09-05',
      });
      expect(first.expiresAt).toBe('2026-09-07T14:30:00.000Z');
      vi.setSystemTime(new Date('2026-09-06T15:30:00Z'));
      expect((await admit(key)).body).toEqual(first);
      expect((await get(`/attempts/${first.attemptId}/control`).expect(200)).body).toEqual(first);
      await begin(key, { channelAccountId: accountId }).expect(409);
    } finally {
      vi.useRealTimers();
    }
  });
  const cancel = (id: string, organizationId = ORG) =>
    request(httpUrl).post(`${base}/attempts/${id}/cancel`).set('x-test-org', organizationId);
  it('stops a running attempt for an operator without its token or an Alert, then admits the next begin at once', async () => {
    const attempt = (await admit()).body;
    await cancel(attempt.attemptId, randomUUID()).expect(404);
    const stopped = (await cancel(attempt.attemptId).expect(200)).body;
    expect(stopped).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect(stopped).not.toHaveProperty('attemptToken');
    expect(await alerts.list(ORG)).toEqual([]);
    await put(attempt, 'roster', roster()).expect(409);
    expect((await cancel(attempt.attemptId).expect(200)).body).toEqual(stopped);
    const next = (await admit()).body;
    expect(next).toMatchObject({ state: 'RUNNING' });
    expect(next.attemptId).not.toBe(attempt.attemptId);
  });
  it('settles an operator stop after the lease passed as expiry with its Alert and leaves a COMPLETE attempt unchanged', async () => {
    const expired = (await admit()).body;
    await prisma.sourceImportRun.update({
      where: { id: expired.attemptId, organizationId: ORG },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await cancel(expired.attemptId).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    expect(await alerts.list(ORG)).toMatchObject([
      { status: 'OPEN', attemptId: expired.attemptId },
    ]);
    const completed = await stage();
    expect((await finish(completed)).status).toBe(201);
    const completeView = (await get(`/attempts/${completed.attemptId}`).expect(200)).body;
    expect(completeView.state).toBe('COMPLETE');
    expect((await cancel(completed.attemptId).expect(200)).body).toEqual(completeView);
  });
  it('reads expiry purely, then next admission persists FAILED and Alert before a new attempt', async () => {
    const attempt = (await admit()).body;
    await prisma.sourceImportRun.update({
      where: { id: attempt.attemptId, organizationId: ORG },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await get(`/attempts/${attempt.attemptId}`)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    expect(await alerts.list(ORG)).toEqual([]);
    const next = (await admit()).body;
    expect(next).toMatchObject({ state: 'RUNNING' });
    expect(next.attemptId).not.toBe(attempt.attemptId);
    expect(await alerts.list(ORG)).toMatchObject([
      { status: 'OPEN', attemptId: attempt.attemptId },
    ]);
    await put(attempt, 'roster', roster()).expect(409);
  });
  it('rolls failure and complete publication back with the source Alert transaction', async () => {
    const first = await stage();
    await finish(first);
    const baseline = await owner.readComplete(ORG, {
      channelAccountId: accountId,
    });
    const failing = (await admit()).body;
    await prisma.$executeRaw`ALTER TABLE alerts ADD CONSTRAINT keyword_alert_failure CHECK (source_type <> 'coupang_ad_keyword')`;
    try {
      await post(failing, 'fail', {
        code: 'PROVIDER_FAILURE',
        message: 'offline',
      }).expect(500);
      expect((await get(`/attempts/${failing.attemptId}`)).body.state).toBe('RUNNING');
    } finally {
      await prisma.$executeRaw`ALTER TABLE alerts DROP CONSTRAINT keyword_alert_failure`;
    }
    await post(failing, 'fail', {
      code: 'PROVIDER_FAILURE',
      message: 'offline',
    }).expect(201);
    const next = await stage();
    await prisma.$executeRaw`ALTER TABLE alerts ADD CONSTRAINT keyword_alert_resolution CHECK (source_type <> 'coupang_ad_keyword' OR status <> 'RESOLVED')`;
    try {
      expect((await finish(next)).status).toBe(500);
      expect((await get(`/attempts/${next.attemptId}`)).body.state).toBe('RUNNING');
      expect(await owner.readComplete(ORG, { channelAccountId: accountId })).toEqual(baseline);
    } finally {
      await prisma.$executeRaw`ALTER TABLE alerts DROP CONSTRAINT keyword_alert_resolution`;
    }
    expect((await finish(next)).body.state).toBe('COMPLETE');
    expect(await alerts.list(ORG)).toMatchObject([
      { status: 'RESOLVED', attemptId: next.attemptId },
    ]);
  });
  it('rejects account identity drift after staging without publishing the stale plan', async () => {
    const attempt = await stage();
    await prisma.channelAccount.update({
      where: { id: accountId, organizationId: ORG },
      data: { vendorId: 'CHANGED' },
    });
    expect((await finish(attempt)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ADVERTISER_IDENTITY_MISMATCH',
    });
    expect((await owner.readComplete(ORG, { channelAccountId: accountId })).rows).toEqual([]);
  });
  it('serializes same-account admission while allowing another account generation without a global publication sequence', async () => {
    const raced = await Promise.all([begin(), begin()]);
    expect(raced.map((result) => result.status).sort()).toEqual([201, 409]);
    const firstId = raced.find((result) => result.status === 201)!.body.attemptId;
    const first = (await get(`/attempts/${firstId}/control`).expect(200)).body;
    const otherAccount = await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Other',
        vendorId: 'VENDOR-B',
      },
    });
    const second = (await admit(randomUUID(), { channelAccountId: otherAccount.id })).body;
    await put(first, 'roster', emptyRoster()).expect(200);
    await put(second, 'roster', {
      ...emptyRoster(),
      advertiserId: 'VENDOR-B',
    }).expect(200);
    expect((await finish(first)).body.state).toBe('COMPLETE');
    expect((await finish(second)).body.state).toBe('COMPLETE');
    expect((await get(`/source?channelAccountId=${accountId}`)).body.latestComplete.attemptId).toBe(
      first.attemptId,
    );
    expect(
      (await get(`/source?channelAccountId=${otherAccount.id}`)).body.latestComplete.attemptId,
    ).toBe(second.attemptId);
  });
  it('reads source metadata from one snapshot while final publication commits', async () => {
    const attempt = (await admit()).body;
    await put(attempt, 'roster', emptyRoster()).expect(200);
    let sawLatest!: () => void;
    const latestRead = new Promise<void>((resolve) => {
      sawLatest = resolve;
    });
    let published!: () => void;
    const committed = new Promise<void>((resolve) => {
      published = resolve;
    });
    const readClient = prisma.$extends({
      query: {
        sourceImportRun: {
          async findFirst({ args, query }) {
            if (args.where?.status === 'completed') {
              await committed;
              return query(args);
            }
            const row = await query(args);
            sawLatest();
            return row;
          },
        },
      },
    });
    const reading = new AdKeywordSourceRepository(channelFactTestPorts(readClient as never).accounts, channelFactTestPorts(readClient as never).listings, readClient as never, alerts).source(
      ORG,
      accountId,
    );
    await latestRead;
    try {
      expect((await finish(attempt)).body.state).toBe('COMPLETE');
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
      latestComplete: { state: 'COMPLETE' },
    });
  });

  describe('through the global exception filter', () => {
    let filtered: INestApplication;
    let filteredUrl: string;
    beforeAll(async () => {
      const module = await Test.createTestingModule({
        controllers: [AdKeywordSourceController],
        providers: [{ provide: AdKeywordSourceRepository, useValue: owner }],
      }).compile();
      filtered = module.createNestApplication({ logger: false, bodyParser: false });
      filtered.use(json({ limit: '25mb' }));
      filtered.setGlobalPrefix('api');
      filtered.use((req: { authUser?: unknown }, _res: unknown, next: () => void) => {
        req.authUser = { id: USER, organizationId: ORG };
        next();
      });
      filtered.useGlobalFilters(new GlobalExceptionFilter());
      await filtered.init();
      await filtered.listen(0, '127.0.0.1');
      filteredUrl = await filtered.getUrl();
    });
    afterAll(async () => {
      await filtered?.close();
    });

    it('keeps the in-progress code and attempt id in a 409 begin body', async () => {
      const key = randomUUID();
      const running = (await admit(key)).body;
      const conflict = await request(filteredUrl)
        .post(`${base}/attempts`)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(409);
      expect(conflict.body).toEqual({
        statusCode: 409,
        code: 'ATTEMPT_IN_PROGRESS',
        kind: 'in_progress',
        message: expect.stringMatching(/[가-힣]/),
        errors: [],
        details: { attemptId: running.attemptId },
        attemptId: running.attemptId,
      });
      const reused = await request(filteredUrl)
        .post(`${base}/attempts`)
        .set('Idempotency-Key', key)
        .send({ channelAccountId: accountId })
        .expect(409);
      expect(reused.body).toMatchObject({
        statusCode: 409,
        code: 'STATE_CONFLICT',
        details: { reason: 'SOURCE_IDEMPOTENCY_KEY_REUSED' },
      });
      expect(reused.body).not.toHaveProperty('attemptId');
    });
  });
});
