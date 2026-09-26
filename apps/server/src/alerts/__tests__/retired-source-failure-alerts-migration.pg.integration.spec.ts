import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { SourceFailureAlerts } from '../alerts.service';
import {
  RETIRED_SOURCE_FAILURE_SOURCE_TYPES,
  removeRetiredSourceFailureAlertsMigration,
} from '../../../../../scripts/data-migrations/v0.1.31/032_remove_retired_source_failure_alerts';

/*
 * 정책 B(KID-355): 실행 계약으로 옮긴 kind는 알림 행을 더 쓰지도 닫지도 않는다. 옮기기 전에 열린 원천 실패 행은 영원히
 * 열려 있게 되므로 컷오버에서 지운다. 아직 옛 writer가 도는 원천(광고 캠페인·키워드·수익성, 몰 주문수집, 소싱 서버 구동,
 * 수동 Wing 카탈로그 적재)과 알림 모듈의 읽음 행은 남는다. 몰 관리자 가져오기(`mall_admin_listings`)는 KID-381에서 옮겼다.
 */
describe('v0.1.31:032 remove retired source-failure alerts (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function alert(input: { sourceType: string; status?: string; type?: string; organizationId?: string; dedupeKey?: string }) {
    return prisma.alert.create({
      data: {
        organizationId: input.organizationId ?? ORG,
        dedupeKey: input.dedupeKey ?? `source:${input.sourceType}:${Math.random()}`,
        sourceType: input.sourceType,
        type: input.type ?? 'source_failure',
        status: input.status ?? 'OPEN',
        title: '수집 실패',
        message: '실패',
        href: '/',
      },
    });
  }

  it('옮긴 원천의 옛 실패 행(열린 것·닫힌 것, 모든 조직)만 지우고, 도는 원천과 읽음 행은 남긴다 — 다시 돌려도 같다', async () => {
    const retired = [
      await alert({ sourceType: 'coupang_wing_traffic', dedupeKey: 'source:coupang_wing_traffic:acc' }),
      await alert({ sourceType: 'coupang_keyword_serp', status: 'RESOLVED' }),
      await alert({ sourceType: 'sellpia_inventory', dedupeKey: 'source:sellpia-products' }),
      await alert({ sourceType: 'sellpia_sales_daily', organizationId: OTHER_ORGANIZATION_ID }),
      await alert({ sourceType: '1688.product_extension' }),
      // 몰 관리자 가져오기(KID-381): 옛 시도 경로의 마지막 writer가 사라졌다.
      await alert({ sourceType: 'mall_admin_listings', dedupeKey: 'channels:mall-admin-listings:org:acc' }),
    ];
    const kept = [
      await alert({ sourceType: 'coupang_ad_campaign' }),
      await alert({ sourceType: 'order_collection_mall' }),
      await alert({ sourceType: 'coupang.wing_catalog' }),
      await alert({ sourceType: 'naver.trend' }),
      await alert({ sourceType: 'channels.mall_admin_listings', type: 'operation_failure', status: 'RESOLVED' }),
      await alert({ sourceType: 'products.sellpia_inventory', type: 'operation_failure', status: 'RESOLVED' }),
    ];

    const first = await prisma.$transaction((tx) => removeRetiredSourceFailureAlertsMigration.run(tx));
    expect(first).toMatchObject({ affectedRows: retired.length, details: { removedAlertRows: retired.length } });
    const left = await prisma.alert.findMany({ select: { id: true } });
    expect(left.map((row) => row.id).sort()).toEqual(kept.map((row) => row.id).sort());

    const again = await prisma.$transaction((tx) => removeRetiredSourceFailureAlertsMigration.run(tx));
    expect(again).toMatchObject({ affectedRows: 0 });
  });

  it('옮긴 kind의 옛 원천 이름은 도는 writer가 쓰는 이름과 겹치지 않는다', () => {
    for (const live of ['coupang_ad_campaign', 'coupang_ad_keyword', 'coupang_ad_profitability', 'order_collection_mall', 'coupang.wing_catalog']) {
      expect(RETIRED_SOURCE_FAILURE_SOURCE_TYPES).not.toContain(live);
    }
  });

  it('지운 뒤 알림 reader는 옛 행 대신 실행 표만 본다', async () => {
    await alert({ sourceType: 'coupang_wing_rank' });
    await prisma.$transaction((tx) => removeRetiredSourceFailureAlertsMigration.run(tx));
    await expect(new SourceFailureAlerts(prisma as never).list(ORG)).resolves.toEqual([]);
  });
});
