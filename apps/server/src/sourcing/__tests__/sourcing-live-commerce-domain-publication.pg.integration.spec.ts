import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import { LiveCommerceController } from '../adapter/in/http/live-commerce.controller';
import { LiveCommerceRepositoryAdapter } from '../adapter/out/repository/live-commerce.repository.adapter';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { LiveCommerceService } from '../application/service/live-commerce.service';
import type { TaobaoLiveCollection, TaobaoLivePort } from '../application/port/out/provider/taobao-live.port';

const fixture: TaobaoLiveCollection = {
  rooms: [{ broadcastId: 'live-1', title: 'Kids live', broadcasterId: 'seller-1', broadcasterName: 'Kids seller', status: 'live', viewerCount: 100, likeCount: 10, startedAt: null, endedAt: null, coverImageUrl: null, sourceUrl: 'https://taobao.example/live-1' }],
  products: [{ broadcastId: 'live-1', productId: 'product-1', rank: 1, title: '儿童玩具', priceCny: 12.5, salesCount: null, imageUrl: null, sourceUrl: 'https://taobao.example/product-1' }],
  warnings: ['지정 방송방: provider warning'],
};

describe('Taobao direct source owner (PG integration)', () => {
  let prisma: PrismaClient;
  let provider: TaobaoLivePort;
  let service: LiveCommerceService;
  let http: LiveCommerceController;
  let abcBefore: unknown;
  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  afterEach(async () => {
    expect((await prisma.$queryRaw<Array<{ absent: boolean }>>`
      SELECT to_regclass('public.operation_runs') IS NULL AS absent
    `)[0]?.absent).toBe(true);
    expect(await prisma.masterProductAbcFormulaState.findMany()).toEqual(abcBefore);
    expect(await prisma.masterProductAbcEvaluation.count()).toBe(0);
    expect(await prisma.masterProductAbcGradeHistory.count()).toBe(0);
    vi.useRealTimers();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.masterProductAbcFormulaState.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, formulaRevision: 9, publicationRevision: 17,
    } });
    abcBefore = await prisma.masterProductAbcFormulaState.findMany();
    provider = {
      readiness: () => ({ configured: true, mode: 'official-api', missing: [] }),
      collect: vi.fn(async () => structuredClone(fixture)),
    };
    service = new LiveCommerceService(provider, new LiveCommerceRepositoryAdapter(prisma as never),
      new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never, new SourceFailureAlerts(prisma as never)));
    http = new LiveCommerceController(service);
  });

  it('retains COMPLETE facts after failure, replays failure, and resolves the same Alert with a new successful attempt', async () => {
    const baseline = await http.collectTaobao({}, 'baseline', TEST_ORGANIZATION_ID);
    const previous = await http.list({ days: 7 }, TEST_ORGANIZATION_ID);
    provider.collect = vi.fn(async () => { throw new Error('provider unavailable'); });
    const failed = await http.collectTaobao({}, 'failed', TEST_ORGANIZATION_ID);
    expect(failed).toMatchObject({ state: 'FAILED', errorCode: 'SOURCE_COLLECTION_FAILED' });
    expect(await http.collectTaobao({}, 'failed', TEST_ORGANIZATION_ID)).toEqual(failed);
    expect(provider.collect).toHaveBeenCalledTimes(1);
    const status = await http.status(TEST_ORGANIZATION_ID);
    expect(status.sources[0]).toMatchObject({ sourceStatus: {
      ready: false,
      latestAttempt: { attemptId: failed.attemptId, state: 'FAILED' },
      latestComplete: { attemptId: baseline.attemptId },
      actualCutoffAt: new Date(previous.broadcasts[0].capturedAt),
    } });
    expect(await http.list({ days: 7 }, TEST_ORGANIZATION_ID)).toEqual(previous);
    const alert = await prisma.alert.findFirstOrThrow();
    expect(alert).toMatchObject({ status: 'OPEN', attemptId: failed.attemptId, sourceType: 'sourcing.taobao-live' });
    provider.collect = vi.fn(async () => structuredClone(fixture));
    const retry = await http.collectTaobao({}, 'retry', TEST_ORGANIZATION_ID);
    expect(retry.attemptId).not.toBe(failed.attemptId);
    expect(retry.state).toBe('COMPLETE');
    expect(await prisma.alert.findFirstOrThrow()).toMatchObject({ id: alert.id, status: 'RESOLVED' });
    expect(await prisma.alert.count()).toBe(1);
  });

  it('returns the original RUNNING attempt on transport replay and conflicts on distinct or drifted starts without holding provider IO locks', async () => {
    let release!: (value: TaobaoLiveCollection) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    provider.collect = vi.fn(() => { started(); return new Promise((resolve) => { release = resolve; }); });
    const pending = http.collectTaobao({ liveIds: ['live-1'] }, 'concurrent', TEST_ORGANIZATION_ID);
    await entered;
    try {
      const replay = await http.collectTaobao({ liveIds: ['live-1'] }, 'concurrent', TEST_ORGANIZATION_ID);
      expect(replay.state).toBe('RUNNING');
      await expect(http.collectTaobao({ liveIds: ['other'] }, 'concurrent', TEST_ORGANIZATION_ID)).rejects.toThrow('SOURCE_IDEMPOTENCY_KEY_REUSED');
      await expect(http.collectTaobao({ queryDate: '20260101' }, 'different', TEST_ORGANIZATION_ID)).rejects.toThrow();
      expect(provider.collect).toHaveBeenCalledTimes(1);
      expect((await http.list({ days: 7 }, TEST_ORGANIZATION_ID)).products).toEqual([]);
    } finally { release(structuredClone(fixture)); }
    expect((await pending).state).toBe('COMPLETE');
  });

  it('rejects a provider result after fixed expiry and derives failure until a new explicit start records expiry and publishes', async () => {
    let release!: (value: TaobaoLiveCollection) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    provider.collect = vi.fn(() => { started(); return new Promise((resolve) => { release = resolve; }); });
    const pending = http.collectTaobao({}, 'expires', TEST_ORGANIZATION_ID);
    await entered;
    const running = (await http.status(TEST_ORGANIZATION_ID)).sources[0].sourceStatus!.latestAttempt!;
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: running.attemptId }, data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    release(structuredClone(fixture));
    await expect(pending).rejects.toThrow('SOURCE_ATTEMPT_EXPIRED');
    expect((await http.status(TEST_ORGANIZATION_ID)).sources[0]).toMatchObject({
      sourceStatus: { ready: false, latestAttempt: { state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' }, latestComplete: null, actualCutoffAt: null },
    });
    expect((await http.list({ days: 7 }, TEST_ORGANIZATION_ID)).products).toEqual([]);
    expect(await prisma.alert.count()).toBe(0);
    provider.collect = vi.fn(async () => structuredClone(fixture));
    expect((await http.collectTaobao({}, 'after-expiry', TEST_ORGANIZATION_ID)).state).toBe('COMPLETE');
    expect(await prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: running.attemptId } })).toMatchObject({ status: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    expect(await prisma.alert.findFirstOrThrow()).toMatchObject({ status: 'RESOLVED' });
  });

  it('preserves AbortSignal behavior and never publishes when aborted after provider resolution', async () => {
    const abort = new AbortController();
    provider.collect = vi.fn(async () => { abort.abort(new Error('cancelled')); return structuredClone(fixture); });
    await expect(service.collectTaobao(TEST_ORGANIZATION_ID, {}, 'aborted', { signal: abort.signal })).rejects.toThrow('cancelled');
    expect(provider.collect).toHaveBeenCalledWith(expect.objectContaining({ signal: abort.signal }));
    expect((await http.list({ days: 7 }, TEST_ORGANIZATION_ID)).products).toEqual([]);
    expect((await http.status(TEST_ORGANIZATION_ID)).sources[0]).toMatchObject({ sourceStatus: { latestAttempt: { state: 'FAILED' } } });
  });

  it('freezes the China calendar default across midnight replays and preserves both explicit date forms', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-04T15:30:00.000Z'));
    const first = await http.collectTaobao({}, 'midnight', TEST_ORGANIZATION_ID);
    expect(first.plan).toMatchObject({ queryDate: '20260904', liveIds: [], pageSize: 100 });
    expect(provider.collect).toHaveBeenCalledWith({ queryDate: '20260904', liveIds: [], pageSize: 100, signal: undefined });
    vi.setSystemTime(new Date('2026-09-04T16:30:00.000Z'));
    expect(await http.collectTaobao({}, 'midnight', TEST_ORGANIZATION_ID)).toEqual(first);
    expect(provider.collect).toHaveBeenCalledTimes(1);
    expect((await http.status(TEST_ORGANIZATION_ID)).sources[0]).toMatchObject({ sourceStatus: { ready: false, latestComplete: { attemptId: first.attemptId } } });
    const explicit = await http.collectTaobao({ queryDate: ' 2026-09-03 ' }, 'explicit', TEST_ORGANIZATION_ID);
    expect(explicit.plan.queryDate).toBe('20260903');
    expect(await http.collectTaobao({ queryDate: '20260903' }, 'explicit', TEST_ORGANIZATION_ID)).toEqual(explicit);
  });

  it('freezes the existing trimmed, deduplicated 30-room provider selection and replays its normalized request', async () => {
    const liveIds = [' room-0 ', 'room-0', '', ...Array.from({ length: 31 }, (_, index) => `room-${index}`)];
    const result = await http.collectTaobao({ liveIds }, 'normalized-rooms', TEST_ORGANIZATION_ID);
    const selected = Array.from({ length: 30 }, (_, index) => `room-${index}`);
    expect(result.plan.liveIds).toEqual(selected);
    expect(provider.collect).toHaveBeenCalledWith(expect.objectContaining({ liveIds: selected }));
    expect(await http.collectTaobao({ liveIds: selected }, 'normalized-rooms', TEST_ORGANIZATION_ID)).toEqual(result);
    expect(provider.collect).toHaveBeenCalledTimes(1);
  });

  it('publishes the provider fixture through HTTP, returns actual provenance and replays without another execution', async () => {
    const input = { queryDate: '2026-09-04', liveIds: ['live-1'], pageSize: 75 };
    const result = await http.collectTaobao(input, 'fixture', TEST_ORGANIZATION_ID);
    expect(result).toMatchObject({ state: 'COMPLETE', plan: { queryDate: '20260904', liveIds: ['live-1'], pageSize: 75 } });
    expect(result).not.toHaveProperty('attemptToken');
    expect(result.warnings).toEqual(fixture.warnings);
    expect(provider.collect).toHaveBeenCalledWith({ queryDate: '20260904', liveIds: ['live-1'], pageSize: 75, signal: undefined });
    const snapshots = await http.list({ days: 7 }, TEST_ORGANIZATION_ID);
    expect(snapshots.broadcasts).toEqual([expect.objectContaining({ ...fixture.rooms[0], ingestionRunId: result.attemptId })]);
    expect(snapshots.products).toEqual([expect.objectContaining({ ...fixture.products[0], ingestionRunId: result.attemptId })]);
    expect(await http.collectTaobao(input, 'fixture', TEST_ORGANIZATION_ID)).toEqual(result);
    expect(provider.collect).toHaveBeenCalledTimes(1);
    expect((await prisma.$queryRaw<Array<{ absent: boolean }>>`
      SELECT to_regclass('public.operation_runs') IS NULL AS absent
    `)[0]?.absent).toBe(true);
    expect(await prisma.alert.count()).toBe(0);
  });
});
