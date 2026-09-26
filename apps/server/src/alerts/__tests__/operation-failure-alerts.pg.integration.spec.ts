import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertItemSchema } from '@kiditem/shared/alerts';
import { SELLPIA_INVENTORY_KIND } from '@kiditem/shared/sellpia-operations';
import { WING_TRAFFIC_KIND } from '@kiditem/shared/advertising-operations';
import { MALL_ORDERS_KIND } from '@kiditem/shared/orders-operations';
import { MALL_ADMIN_LISTINGS_KIND } from '@kiditem/shared/channels-operations';
import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { SourceFailureAlerts } from '../alerts.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';

/*
 * 정책 B(KID-355, 사장님 2026-09-26): 실행 계약으로 옮긴 kind의 실패는 `operations` 행에만 남고, 알림 reader가 그 실행을
 * 알림으로 만든다. 실행 행은 이 스펙이 직접 넣는다(실행 계약이 닫은 모양 그대로) — 읽기 규칙만 본다.
 */
describe('SourceFailureAlerts — 실행 표의 실패를 알림으로 읽는다 (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let alerts: SourceFailureAlerts;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function finished(input: {
    kind?: string;
    status: 'succeeded' | 'failed' | 'cancelled' | 'executing';
    errorCode?: string | null;
    errorMessage?: string | null;
    finishedAt: string;
    startedAt?: string;
    plan?: Record<string, unknown>;
    organizationId?: string;
    maxAttempts?: number;
  }): Promise<string> {
    const id = randomUUID();
    const finishedAt = new Date(input.finishedAt);
    await prisma.operation.create({
      data: {
        id,
        organizationId: input.organizationId ?? ORG,
        kind: input.kind ?? SELLPIA_INVENTORY_KIND,
        status: input.status,
        token: randomUUID(),
        // 도는 실행이면 `finishedAt`을 임대 만료 시각으로 쓴다.
        expiresAt: finishedAt,
        plan: (input.plan ?? {}) as never,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        startedAt: input.startedAt ? new Date(input.startedAt) : new Date(finishedAt.getTime() - 60_000),
        finishedAt: input.status === 'executing' ? null : finishedAt,
        attempts: 1,
        maxAttempts: input.maxAttempts ?? 1,
      },
    });
    return id;
  }

  it('최신 실패가 열린 알림 하나가 된다 — id·attemptId는 실행 id, 문장은 레지스트리 한국어, 원문은 싣지 않는다', async () => {
    await finished({ status: 'succeeded', finishedAt: '2026-09-26T01:00:00Z' });
    const failedId = await finished({
      status: 'failed',
      errorCode: 'OPERATION_FENCE_LOST',
      errorMessage: 'expired',
      finishedAt: '2026-09-26T02:00:00Z',
    });

    const listed = await alerts.list(ORG);

    expect(listed).toEqual([{
      id: failedId,
      attemptId: failedId,
      status: 'OPEN',
      type: 'operation_failure',
      title: '셀피아 재고 수집 실패',
      message: '이 실행은 더 이상 유효하지 않습니다. 다시 시작해 주세요.',
      targetType: null,
      targetId: null,
      sourceType: SELLPIA_INVENTORY_KIND,
      href: '/product-hub',
      isRead: false,
      createdAt: '2026-09-26T02:00:00.000Z',
      updatedAt: '2026-09-26T02:00:00.000Z',
    }]);
    // 웹은 공유 스키마로 읽는다.
    expect(() => AlertItemSchema.array().parse(listed)).not.toThrow();
  });

  it('모르는 코드는 원천별 일반 문장이다(영어 원문이 알림에 닿지 않는다)', async () => {
    await finished({ status: 'failed', errorCode: 'SOMETHING_ODD', errorMessage: 'TypeError: x is undefined', finishedAt: '2026-09-26T02:00:00Z' });
    const [item] = await alerts.list(ORG);
    expect(item?.message).toBe('셀피아 재고 수집 작업이 실패했습니다. 다시 시도해 주세요.');
  });

  it('뒤에 같은 원천의 성공이 있으면 닫힌 알림(RESOLVED)이 된다 — 옛 resolveSourceFailure와 같은 뜻', async () => {
    const failedId = await finished({ status: 'failed', errorCode: 'NETWORK_FAILED', finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ status: 'succeeded', finishedAt: '2026-09-26T02:00:00Z' });

    await expect(alerts.list(ORG)).resolves.toMatchObject([
      { id: failedId, status: 'RESOLVED', createdAt: '2026-09-26T01:00:00.000Z', updatedAt: '2026-09-26T02:00:00.000Z' },
    ]);
    await expect(alerts.list(ORG, { status: 'OPEN' })).resolves.toEqual([]);
  });

  it('성공만 있는 원천, 취소로 끝난 실행은 알림이 아니다 — 취소는 앞선 실패를 닫지도 않는다', async () => {
    await finished({ kind: WING_TRAFFIC_KIND, status: 'succeeded', finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ status: 'failed', errorCode: 'USER_CANCELLED', finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ status: 'cancelled', errorCode: 'OPERATION_CANCELLED', finishedAt: '2026-09-26T01:30:00Z' });
    await expect(alerts.list(ORG)).resolves.toEqual([]);

    const failedId = await finished({ status: 'failed', errorCode: 'NETWORK_FAILED', finishedAt: '2026-09-26T02:00:00Z' });
    await finished({ status: 'failed', errorCode: 'USER_CANCELLED', finishedAt: '2026-09-26T03:00:00Z' });
    await expect(alerts.list(ORG)).resolves.toMatchObject([{ id: failedId, status: 'OPEN' }]);
  });

  it('원천 정체성은 kind + plan의 채널 계정이다 — 한 계정의 성공이 다른 계정의 실패를 닫지 않는다', async () => {
    const accountA = randomUUID();
    const accountB = randomUUID();
    const failedA = await finished({ kind: WING_TRAFFIC_KIND, status: 'failed', errorCode: 'NETWORK_FAILED', plan: { channelAccountId: accountA }, finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ kind: WING_TRAFFIC_KIND, status: 'succeeded', plan: { channelAccountId: accountB }, finishedAt: '2026-09-26T02:00:00Z' });

    await expect(alerts.list(ORG)).resolves.toMatchObject([
      { id: failedA, status: 'OPEN', sourceType: WING_TRAFFIC_KIND, href: '/ad-ops', title: '쿠팡 윙 트래픽 수집 실패' },
    ]);
  });

  it('소싱 키워드 제안은 키워드(targetKey)마다 원천이다 — 키워드 B의 성공이 키워드 A의 실패를 닫지 않는다', async () => {
    const kind = SOURCING_OPERATION_KINDS.coupangKeywordSuggestion;
    const failedA = await finished({ kind, status: 'failed', errorCode: 'NETWORK_FAILED', plan: { targetKey: 'keyword:a' }, finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ kind, status: 'succeeded', plan: { targetKey: 'keyword:b' }, finishedAt: '2026-09-26T02:00:00Z' });
    await expect(alerts.list(ORG)).resolves.toMatchObject([{ id: failedA, status: 'OPEN', sourceType: kind }]);

    await finished({ kind, status: 'succeeded', plan: { targetKey: 'keyword:a' }, finishedAt: '2026-09-26T03:00:00Z' });
    await expect(alerts.list(ORG)).resolves.toMatchObject([{ id: failedA, status: 'RESOLVED' }]);
  });

  it('라이브 수집·상품 수집은 원천(sourceKey)마다 원천이다 — 도우인 성공이 1688 실패를 닫지 않는다', async () => {
    const kind = SOURCING_OPERATION_KINDS.liveCommerce;
    const failed1688 = await finished({ kind, status: 'failed', errorCode: 'NETWORK_FAILED', plan: { sourceKey: '1688.live_commerce' }, finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ kind, status: 'succeeded', plan: { sourceKey: 'douyin.live_commerce' }, finishedAt: '2026-09-26T02:00:00Z' });
    const product = SOURCING_OPERATION_KINDS.productExtension;
    const failedAlibaba = await finished({ kind: product, status: 'failed', errorCode: 'NETWORK_FAILED', plan: { sourceKey: 'alibaba.product_extension' }, finishedAt: '2026-09-26T01:30:00Z' });
    await finished({ kind: product, status: 'succeeded', plan: { sourceKey: '1688.product_extension' }, finishedAt: '2026-09-26T02:30:00Z' });

    const listed = await alerts.list(ORG);
    expect(listed.map((item) => [item.id, item.status])).toEqual([[failedAlibaba, 'OPEN'], [failed1688, 'OPEN']]);
  });

  it('몰 주문 수집은 몰(mallKey)마다 원천이다 — 한 몰의 성공이 다른 몰의 실패를 닫지 않는다', async () => {
    const failedGs = await finished({ kind: MALL_ORDERS_KIND, status: 'failed', errorCode: 'NETWORK_FAILED', plan: { mallKey: 'gs-shop' }, finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ kind: MALL_ORDERS_KIND, status: 'succeeded', plan: { mallKey: 'onch' }, finishedAt: '2026-09-26T02:00:00Z' });
    await expect(alerts.list(ORG)).resolves.toMatchObject([{ id: failedGs, status: 'OPEN', sourceType: MALL_ORDERS_KIND }]);
  });

  it('몰마다 도는 kind의 알림은 몰 이름을 제목에 싣고 채널 계정을 대상(targetType channel_account)으로 가리킨다', async () => {
    const gsAccount = randomUUID();
    const onchAccount = randomUUID();
    const orders = await finished({ kind: MALL_ORDERS_KIND, status: 'failed', errorCode: 'NETWORK_FAILED', plan: { mallKey: 'gs-shop', mallName: 'GS샵', channelAccountId: gsAccount }, finishedAt: '2026-09-26T02:00:00Z' });
    const listings = await finished({ kind: MALL_ADMIN_LISTINGS_KIND, status: 'failed', errorCode: 'NETWORK_FAILED', plan: { mallKey: 'onch', channelAccountId: onchAccount }, finishedAt: '2026-09-26T01:00:00Z' });

    await expect(alerts.list(ORG)).resolves.toMatchObject([
      { id: orders, title: 'GS샵 몰 주문 수집 실패', targetType: 'channel_account', targetId: gsAccount },
      { id: listings, title: '온채널 몰 등록 상품 가져오기 실패', targetType: 'channel_account', targetId: onchAccount },
    ]);
  });

  it('원천 실패가 아닌 owner 거절(이미 수집한 원본)은 알림이 아니고, 앞선 진짜 실패를 가리지 않는다', async () => {
    const product = SOURCING_OPERATION_KINDS.productExtension;
    const failed = await finished({ kind: product, status: 'failed', errorCode: 'NETWORK_FAILED', plan: { sourceKey: '1688.product_extension' }, finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ kind: product, status: 'failed', errorCode: 'SOURCING_DUPLICATE_RECORD', plan: { sourceKey: '1688.product_extension' }, finishedAt: '2026-09-26T02:00:00Z' });
    await expect(alerts.list(ORG)).resolves.toMatchObject([{ id: failed, status: 'OPEN', message: '네트워크 연결에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.' }]);
  });

  it('임대가 끝났는데 처분되지 않은 실행: 시도를 다 썼으면 만료 실패 알림(끝난 시각 = 임대 만료), 남았으면 알림이 아니다', async () => {
    const retrying = await finished({ status: 'executing', finishedAt: '2026-09-26T01:00:00Z', maxAttempts: 2 });
    await expect(alerts.list(ORG)).resolves.toEqual([]);

    await prisma.operation.update({ where: { id: retrying }, data: { maxAttempts: 1 } });
    await expect(alerts.list(ORG)).resolves.toMatchObject([{
      id: retrying,
      status: 'OPEN',
      message: '이 실행은 더 이상 유효하지 않습니다. 다시 시작해 주세요.',
      createdAt: '2026-09-26T01:00:00.000Z',
    }]);
  });

  it('성공과 실패가 같은 밀리초에 끝나도 뒤에 시작한 성공이 알림을 닫는다', async () => {
    const failed = await finished({ status: 'failed', errorCode: 'NETWORK_FAILED', startedAt: '2026-09-26T00:59:00Z', finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ status: 'succeeded', startedAt: '2026-09-26T00:59:30Z', finishedAt: '2026-09-26T01:00:00Z' });
    await expect(alerts.list(ORG)).resolves.toMatchObject([{ id: failed, status: 'RESOLVED' }]);
  });

  it('옛 source_failure 행과 합쳐 최근 순으로 내려 준다', async () => {
    const legacy = await prisma.alert.create({
      data: {
        organizationId: ORG,
        dedupeKey: 'source:legacy',
        sourceType: 'coupang_ad_campaign',
        type: 'source_failure',
        status: 'OPEN',
        title: '광고 캠페인 수집 실패',
        message: '네트워크 오류',
        href: '/ad-ops',
        updatedAt: new Date('2026-09-26T03:00:00Z'),
      },
    });
    const failedId = await finished({ status: 'failed', errorCode: 'NETWORK_FAILED', finishedAt: '2026-09-26T02:00:00Z' });

    const listed = await alerts.list(ORG);
    expect(listed.map((item) => item.id)).toEqual([legacy.id, failedId]);
    await expect(alerts.list(ORG, { limit: 1 })).resolves.toMatchObject([{ id: legacy.id }]);
  });

  it('dismiss는 실행 id를 받아 알림 모듈 표에 읽음 행을 쓰고, 같은 원천의 새 실패는 다시 안 읽음이다', async () => {
    const first = await finished({ status: 'failed', errorCode: 'NETWORK_FAILED', finishedAt: '2026-09-26T01:00:00Z' });

    await alerts.dismiss(first, ORG);
    await alerts.dismiss(first, ORG); // 다시 눌러도 같다

    await expect(alerts.list(ORG)).resolves.toMatchObject([{ id: first, isRead: true, status: 'OPEN' }]);
    await expect(alerts.list(ORG, { isRead: false })).resolves.toEqual([]);
    await expect(prisma.alert.findMany({ where: { organizationId: ORG } })).resolves.toMatchObject([
      { type: 'operation_failure', dedupeKey: `operation:${first}`, attemptId: first, status: 'RESOLVED', readAt: expect.any(Date) },
    ]);

    const second = await finished({ status: 'failed', errorCode: 'NETWORK_FAILED', finishedAt: '2026-09-26T02:00:00Z' });
    await expect(alerts.list(ORG)).resolves.toMatchObject([{ id: second, isRead: false }]);
  });

  it('닫힌 실행 알림, 없는 id, 다른 조직의 실행은 dismiss할 수 없다', async () => {
    const resolved = await finished({ status: 'failed', errorCode: 'NETWORK_FAILED', finishedAt: '2026-09-26T01:00:00Z' });
    await finished({ status: 'succeeded', finishedAt: '2026-09-26T02:00:00Z' });
    const foreign = await finished({ organizationId: OTHER_ORGANIZATION_ID, status: 'failed', errorCode: 'NETWORK_FAILED', finishedAt: '2026-09-26T01:00:00Z' });

    await expect(alerts.dismiss(resolved, ORG)).rejects.toBeInstanceOf(NotFoundException);
    await expect(alerts.dismiss(randomUUID(), ORG)).rejects.toBeInstanceOf(NotFoundException);
    await expect(alerts.dismiss(foreign, ORG)).rejects.toBeInstanceOf(NotFoundException);
    await expect(prisma.alert.count()).resolves.toBe(0);
  });

  it('다른 조직의 실행 실패는 보이지 않는다', async () => {
    await finished({ organizationId: OTHER_ORGANIZATION_ID, status: 'failed', errorCode: 'NETWORK_FAILED', finishedAt: '2026-09-26T01:00:00Z' });
    await expect(alerts.list(ORG)).resolves.toEqual([]);
  });

  it('옮기지 않은 kind(서버 AI 작업)의 실패는 알림이 아니다', async () => {
    await finished({ kind: 'content.thumbnail_generate', status: 'failed', errorCode: 'CONTENT_GENERATION_FAILED', finishedAt: '2026-09-26T01:00:00Z' });
    await expect(alerts.list(ORG)).resolves.toEqual([]);
  });
});
