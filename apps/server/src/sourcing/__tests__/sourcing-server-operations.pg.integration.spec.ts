import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SOURCING_SERVER_KINDS } from '@kiditem/shared/sourcing-operation';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { sourcingServerOperations } from '../../test-helpers/sourcing-server-operations';
import { hashCollectionRequest } from '../application/service/sourcing-collection-mappers';
import type { SourcingServerScopeInput } from '../application/service/sourcing-server-operation.runner';

/**
 * 서버 구동 소싱 kind(KID-389): 서버가 요청 안에서 begin → source_output 청크 → finish 한다. 성공은 원장 행과
 * 발행 1행을 실행 id로 쓰고 원천 실패 알림을 닫는다. 범위를 다 채우지 못한 출력은 발행 없이 failed로 닫고 실패 단위
 * 결과를 실행에 남기며 알림을 연다. 실행 표 · 발행 표 · 알림 표는 실제 PostgreSQL이다.
 */
const SOURCE = 'naver.trend';
const ALERT = { sourceType: SOURCE, dedupeKey: 'source:naver.trend', title: '네이버 트렌드 수집 실패', href: '/sourcing-ai/market' };
const CAPTURED_AT = new Date('2026-09-29T01:00:00.000Z');

function scope(targetKey: string, attemptPlan: Record<string, unknown> = { source: SOURCE, keywords: ['슬라임'] }): SourcingServerScopeInput {
  return {
    sourceKey: SOURCE, scopeKey: 'default', targetKey, planChecksum: hashCollectionRequest(attemptPlan),
    requestFingerprint: hashCollectionRequest({ source: 'naver' }), collectorKey: 'trend-naver',
    collectorVersion: 'trend-source/v1', attemptPlan: attemptPlan as SourcingServerScopeInput['attemptPlan'], failureAlert: ALERT,
  };
}

function observationOutput(operationId: string, rejectedCount = 0, qualityReport: Record<string, unknown> = {}) {
  return {
    observations: [{
      organizationId: ORG, operationId, sourceKey: SOURCE, platform: 'naver', evidenceFamily: 'supplier_product_scrape',
      signalRole: 'supply', granularity: 'supply_catalog', conceptKey: null, sourceEntityType: 'supplier_offer',
      sourceEntityId: 'offer-1', schemaVersion: 'test/v1', observationKey: operationId, revision: 1, supportsCandidate: true,
      sourceUrl: null, eventAt: CAPTURED_AT, observedAt: CAPTURED_AT, availableAt: CAPTURED_AT, revisionAt: null,
      ingestedAt: CAPTURED_AT, payloadHash: hashCollectionRequest({ a: 1 }), rawPayload: { a: 1 },
    }],
    typedRecords: [],
    discoveredCount: 1,
    rejectedCount,
    qualityReport,
  } as never;
}

describe('서버 구동 소싱 kind (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let harness: ReturnType<typeof sourcingServerOperations>;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    harness = sourcingServerOperations(prisma, realSalesProductDraftPort(prisma));
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const begin = (targetKey: string, key = `key-${targetKey}`, attemptPlan?: Record<string, unknown>) => harness.runner.begin({
    organizationId: ORG, userId: USER, kind: 'sourcing.naver_trend', scope: scope(targetKey, attemptPlan), requestIdempotencyKey: key,
  });

  it('HTTP begin은 서버 kind 8개 모두 거절하고, 서버 begin은 실행을 연다', async () => {
    for (const kind of SOURCING_SERVER_KINDS) {
      await expect(harness.operations.begin(ORG, { kind, scope: {} }, { userId: USER, origin: 'http' }))
        .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'server_driven_kind' } });
    }
    const run = await begin('t1');
    expect(run).toMatchObject({ created: true, attempt: { state: 'RUNNING', sourceKey: SOURCE, targetKey: 't1' } });
    expect(run.token).toEqual(expect.any(String));
  });

  it('성공은 원장 행과 현재 발행 1행을 실행 id로 쓰고, 열린 원천 실패 알림을 닫는다', async () => {
    const failed = await begin('t1', 'k-fail');
    await harness.runner.fail(ORG, failed, 'SOURCE_COLLECTION_FAILED', '공급자 응답이 없습니다.');
    expect(await prisma.alert.findMany({ where: { organizationId: ORG }, select: { status: true, dedupeKey: true } }))
      .toEqual([{ status: 'OPEN', dedupeKey: ALERT.dedupeKey }]);

    const run = await begin('t1', 'k-ok');
    const done = await harness.runner.complete(ORG, run, observationOutput(run.attempt.attemptId), {
      contentChecksum: 'c1', windowStartAt: null, windowEndAt: CAPTURED_AT,
    });
    expect(done).toMatchObject({ state: 'COMPLETE', attemptId: run.attempt.attemptId, acceptedCount: 1 });
    expect(await prisma.sourcingEvidenceObservation.count({ where: { organizationId: ORG, operationId: run.attempt.attemptId } })).toBe(1);
    expect(await prisma.sourcingSourcePublication.findMany({ where: { organizationId: ORG }, select: { operationId: true, isCurrent: true } }))
      .toEqual([{ operationId: run.attempt.attemptId, isCurrent: true }]);
    expect(await prisma.alert.findMany({ where: { organizationId: ORG }, select: { status: true } })).toEqual([{ status: 'RESOLVED' }]);
  });

  it('rejected>0이면 failed로 닫고 발행 0 · 원장 0이며 실패 단위 결과를 실행 result에 남긴다', async () => {
    const run = await begin('t1');
    const unitResult = { keyword: '슬라임', targetId: null, outcome: 'failed', discovered: 0, accepted: 0, duplicate: 0, failed: 1, errorCode: 'blocked' };
    const failed = await harness.runner.complete(ORG, run, observationOutput(run.attempt.attemptId, 1, { unitResult }), {
      contentChecksum: 'c1', windowStartAt: null, windowEndAt: CAPTURED_AT,
    });
    expect(failed).toMatchObject({ state: 'FAILED', errorCode: 'SOURCE_PLAN_INCOMPLETE', unitResult });
    expect(await prisma.sourcingSourcePublication.count({ where: { organizationId: ORG } })).toBe(0);
    expect(await prisma.sourcingEvidenceObservation.count({ where: { organizationId: ORG } })).toBe(0);
    expect(await harness.runner.read(ORG, run.attempt.attemptId, ['sourcing.naver_trend'])).toMatchObject({ unitResult });
    expect(await prisma.alert.count({ where: { organizationId: ORG, status: 'OPEN' } })).toBe(1);
  });

  it('같은 대상이 진행 중이면 두 번째 begin은 계약의 겹침으로 거절된다', async () => {
    await begin('t1', 'k1');
    await expect(begin('t1', 'k2')).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
  });

  it('같은 요청 멱등 키의 재전송은 같은 실행을 돌려주고, 다른 요청이면 거절한다', async () => {
    const first = await begin('t1', 'same');
    const replay = await begin('t1', 'same');
    expect(replay).toMatchObject({ created: false, token: null, attempt: { attemptId: first.attempt.attemptId } });
    await expect(harness.runner.begin({
      organizationId: ORG, userId: USER, kind: 'sourcing.naver_trend',
      scope: { ...scope('t1'), requestFingerprint: 'other' }, requestIdempotencyKey: 'same',
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'idempotency_key_reused' } });
  });

  it('ready는 현재 발행의 plan 지문이 지금 plan과 같을 때만이고, 실패한 최신 실행은 오류를 싣는다', async () => {
    const plan = { source: SOURCE, keywords: ['슬라임'] };
    const run = await begin('t1', 'k1', plan);
    await harness.runner.complete(ORG, run, observationOutput(run.attempt.attemptId), { contentChecksum: 'c', windowStartAt: null, windowEndAt: CAPTURED_AT });
    const target = { organizationId: ORG, kinds: ['sourcing.naver_trend'] as const, sourceKey: SOURCE, scopeKey: 'default', targetKey: 't1' };
    expect(await harness.runner.readSourceStatus({ ...target, currentPlanChecksum: hashCollectionRequest(plan) }))
      .toMatchObject({ ready: true, latestComplete: { attemptId: run.attempt.attemptId }, actualCutoffAt: CAPTURED_AT });
    expect((await harness.runner.readSourceStatus({ ...target, currentPlanChecksum: 'changed' })).ready).toBe(false);

    const later = await begin('t1', 'k2', plan);
    await harness.runner.fail(ORG, later, 'SOURCE_COLLECTION_FAILED', '공급자 응답이 없습니다.');
    expect(await harness.runner.readSourceStatus({ ...target, currentPlanChecksum: hashCollectionRequest(plan) })).toMatchObject({
      ready: true,
      latestAttempt: { attemptId: later.attempt.attemptId, state: 'FAILED' },
      latestComplete: { attemptId: run.attempt.attemptId },
      errorCode: 'SOURCE_COLLECTION_FAILED',
    });
  });

  it('옛 run 시절 발행은 실행 없이 latestComplete만 나온다', async () => {
    const plan = { source: SOURCE, keywords: ['슬라임'] };
    await prisma.sourcingSourcePublication.create({ data: {
      organizationId: ORG, operationId: '00000000-0000-4000-8000-000000000001', sourceKey: SOURCE, scopeKey: 'default',
      targetKey: 't1', isCurrent: true, collectorKey: 'trend-naver', collectorVersion: 'trend-source/v1', plan,
      discoveredCount: 1, acceptedCount: 1, duplicateCount: 0, qualityReport: { planChecksum: hashCollectionRequest(plan) },
      completedAt: CAPTURED_AT,
    } });
    expect(await harness.runner.readSourceStatus({ organizationId: ORG, kinds: ['sourcing.naver_trend'], sourceKey: SOURCE,
      scopeKey: 'default', targetKey: 't1', currentPlanChecksum: hashCollectionRequest(plan) })).toMatchObject({
      ready: true, latestAttempt: null, latestComplete: { attemptId: '00000000-0000-4000-8000-000000000001', state: 'COMPLETE' },
    });
  });
});
