import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SELLPIA_INVENTORY_KIND,
  SELLPIA_PRODUCT_PROFITABILITY_KIND,
  SELLPIA_SALES_KIND,
} from '@kiditem/shared/sellpia-operations';
import { SellpiaInventoryCollectionStatusViewSchema } from '@kiditem/shared/sellpia-inventory-freshness';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { ProductCollectionFreshnessRepositoryAdapter } from '../adapter/out/persistence/product-source-freshness.repository.adapter';
import { ProductCollectionFreshnessUseCase } from '../application/service/product-collection-freshness.usecase';

/*
 * `GET /api/inventory/sellpia-collection-status`(조직도 셀피아 상태, KID-361 must 1 · KID-355 정책 B). 도는 실행·실패는
 * 실행 표(셀피아 세 kind — 재고·매출·상품 손익, 셀피아 로그인 하나를 나눠 쓴다)의 최신 실행이, 완료·미수집은 재고 발행 상태가
 * 말한다. 실행 행은 이 스펙이 계약이 남기는 모양 그대로 넣는다.
 */
describe('셀피아 수집 상태 — 실행 표에서 읽는다 (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let status: ProductCollectionFreshnessUseCase;
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    status = new ProductCollectionFreshnessUseCase(new ProductCollectionFreshnessRepositoryAdapter(prisma as never));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function operation(input: {
    kind: string;
    status: 'prepared' | 'executing' | 'succeeded' | 'failed' | 'cancelled';
    startedAt: Date;
    errorCode?: string;
    errorMessage?: string;
    expiresAt?: Date;
    attempts?: number;
    maxAttempts?: number;
    organizationId?: string;
  }): Promise<string> {
    const id = randomUUID();
    const terminal = ['succeeded', 'failed', 'cancelled'].includes(input.status);
    await prisma.operation.create({
      data: {
        id,
        organizationId: input.organizationId ?? ORG,
        kind: input.kind,
        status: input.status,
        token: randomUUID(),
        plan: {},
        startedAt: input.startedAt,
        expiresAt: input.expiresAt ?? new Date(input.startedAt.getTime() + 30 * 60_000),
        finishedAt: terminal ? new Date(input.startedAt.getTime() + 60_000) : null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        attempts: input.attempts ?? 1,
        maxAttempts: input.maxAttempts ?? 1,
      },
    });
    return id;
  }

  async function published(operationId: string, at: Date) {
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: ORG,
        sourceAccountKey: 'kiditem',
        lastCompletedOperationId: operationId,
        lastVerifiedAt: at,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
      },
    });
  }

  const read = async () => SellpiaInventoryCollectionStatusViewSchema.parse(await status.getCollectionState({ organizationId: ORG, userId: USER }));

  it('수집한 적도 도는 실행도 없으면 not_collected다', async () => {
    await expect(read()).resolves.toMatchObject({ status: 'not_collected', activeSync: null, lastAttempt: null, lastAttemptId: null });
  });

  it('셀피아 세 kind 중 하나라도 돌면(prepared·executing) running이고 그 실행을 activeSync로 보인다', async () => {
    const done = await operation({ kind: SELLPIA_INVENTORY_KIND, status: 'succeeded', startedAt: minutesAgo(30) });
    await published(done, minutesAgo(29));
    const salesStartedAt = minutesAgo(2);
    const sales = await operation({ kind: SELLPIA_SALES_KIND, status: 'executing', startedAt: salesStartedAt });

    await expect(read()).resolves.toMatchObject({
      status: 'running',
      lastAttemptId: sales,
      activeSync: { attemptId: sales, startedAt: salesStartedAt.toISOString() },
      lastCompletedAttemptId: done,
    });

    await prisma.operation.update({ where: { id: sales }, data: { status: 'prepared' } });
    await expect(read()).resolves.toMatchObject({ status: 'running', activeSync: { attemptId: sales } });
  });

  it('최신 실행이 실패면 failed이고 그 코드를 lastAttempt로 준다 — 로그인 필요는 SITE_LOGIN_REQUIRED', async () => {
    const done = await operation({ kind: SELLPIA_INVENTORY_KIND, status: 'succeeded', startedAt: minutesAgo(30) });
    await published(done, minutesAgo(29));
    const failed = await operation({
      kind: SELLPIA_PRODUCT_PROFITABILITY_KIND,
      status: 'failed',
      startedAt: minutesAgo(5),
      errorCode: 'SITE_LOGIN_REQUIRED',
      errorMessage: '셀피아 로그인이 필요합니다.',
    });

    await expect(read()).resolves.toMatchObject({
      status: 'failed',
      lastAttemptId: failed,
      activeSync: null,
      lastAttempt: { kind: SELLPIA_PRODUCT_PROFITABILITY_KIND, errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.' },
      lastCompletedAttemptId: done,
    });
  });

  it('임대가 끝나 재시도가 없는 실행은 만료 실패(OPERATION_FENCE_LOST)로 읽힌다', async () => {
    const lapsed = await operation({ kind: SELLPIA_INVENTORY_KIND, status: 'executing', startedAt: minutesAgo(90), expiresAt: minutesAgo(1) });
    await expect(read()).resolves.toMatchObject({
      status: 'failed',
      lastAttemptId: lapsed,
      lastAttempt: { errorCode: 'OPERATION_FENCE_LOST' },
    });
  });

  it('실패 뒤 다른 셀피아 kind가 성공했으면 complete — 중단한 실행은 상태를 바꾸지 않는다', async () => {
    const done = await operation({ kind: SELLPIA_INVENTORY_KIND, status: 'succeeded', startedAt: minutesAgo(60) });
    const completedAt = minutesAgo(59);
    await published(done, completedAt);
    await operation({ kind: SELLPIA_INVENTORY_KIND, status: 'failed', startedAt: minutesAgo(40), errorCode: 'SITE_LOGIN_REQUIRED' });
    const sales = await operation({ kind: SELLPIA_SALES_KIND, status: 'succeeded', startedAt: minutesAgo(20) });
    await operation({ kind: SELLPIA_PRODUCT_PROFITABILITY_KIND, status: 'cancelled', startedAt: minutesAgo(5), errorCode: 'OPERATION_CANCELLED' });

    await expect(read()).resolves.toMatchObject({
      status: 'complete',
      lastAttemptId: sales,
      lastAttempt: { errorCode: null, errorMessage: null },
      lastCompletedAttemptId: done,
      lastCompletedAt: completedAt.toISOString(),
      activeSync: null,
    });
  });

  it('다른 조직의 실행은 보이지 않는다', async () => {
    await operation({ organizationId: OTHER_ORG, kind: SELLPIA_INVENTORY_KIND, status: 'failed', startedAt: minutesAgo(1), errorCode: 'SITE_LOGIN_REQUIRED' });
    await operation({ organizationId: OTHER_ORG, kind: SELLPIA_SALES_KIND, status: 'executing', startedAt: minutesAgo(1) });
    await expect(read()).resolves.toMatchObject({ status: 'not_collected', lastAttempt: null, activeSync: null });
  });
});
