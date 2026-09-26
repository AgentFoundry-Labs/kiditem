import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

/**
 * 실행 계약(ADR-0025)으로 옮긴 원천이 옛 attempt 시절 알림 행에 적던 `sourceType` — v0.1.31의 한 순간이라 문자열로
 * 적는다(마이그레이션은 그때를 기록한다). KID-355 정책 B 뒤로 이 원천들은 알림 행을 쓰지도 닫지도 않고, 알림 reader가
 * 실행 표에서 실패를 읽는다. 아직 옛 writer가 도는 원천(`coupang_ad_*`, `order_collection_mall`,
 * `mall_admin_listings`, 수동 적재 `coupang.wing_catalog`, 소싱 서버 구동)은 여기 없다.
 */
export const RETIRED_SOURCE_FAILURE_SOURCE_TYPES = [
  // 광고 kind 7종(wave3)
  'coupang_wing_tracked_products',
  'coupang_wing_rank',
  'coupang_keyword_serp',
  'coupang_competitor_seller_identity',
  'coupang_competitor_catalog',
  'coupang_wing_traffic',
  'coupang_wing_itemwinner',
  // 셀피아 3종(wave3)
  'sellpia_inventory',
  'sellpia_sales_daily',
  'sellpia_product_profitability',
  // 소싱 확장 kind(wave1) — 서버 수동 적재가 쓰는 `coupang.wing_catalog`는 뺀다
  'coupang.keyword_suggestion',
  '1688.hot_product',
  'tiktok.creative',
  '1688.live_commerce',
  'douyin.live_commerce',
  '1688.product_extension',
  'alibaba.product_extension',
  // 카탈로그·상품평(wave1), 주문(wave2)
  'coupang_wing_catalog',
  'coupang_reviews',
  'coupang_direct_order_capture',
  'coupang_shipment_summary',
  'coupang_rocket_po_catalog',
] as const;

const SOURCE_FAILURE_ALERT_TYPE = 'source_failure';

/**
 * 옮긴 원천의 옛 `source_failure` 알림 행을 지운다(KID-355 정책 B). 열린 행은 더는 닫힐 길이 없고(성공한 실행이 알림
 * 행을 닫지 않는다), 닫힌 행은 화면이 kind 이름만 읽게 된 뒤 어느 원천에도 붙지 않는 기록이다. 같은 실패는 알림
 * reader가 실행 표에서 다시 보인다. `005`처럼 지운다 — 새 계약이 나타낼 수 없는 행에 새 상태를 지어 붙이지 않는다.
 * 알림 모듈의 읽음 행(`operation_failure`)과 도는 원천의 행은 건드리지 않는다. 다시 돌리면 지울 행이 없다.
 */
export const removeRetiredSourceFailureAlertsMigration: DataMigration = {
  id: 'v0.1.31:032_remove_retired_source_failure_alerts',
  releaseVersion: '0.1.31',
  name: 'Remove source-failure alerts of sources moved to the operation contract',
  phase: 'post-schema',
  async run(tx: Prisma.TransactionClient): Promise<MigrationResult> {
    const sourceTypes = [...RETIRED_SOURCE_FAILURE_SOURCE_TYPES];
    // queryraw-tenancy-exempt: 컷오버 정리 — 모든 조직의 옮긴 원천 행을 지운다.
    const removedAlertRows = await tx.$executeRaw`
      DELETE FROM alerts
      WHERE type = ${SOURCE_FAILURE_ALERT_TYPE}
        AND source_type = ANY(${sourceTypes}::text[])
    `;
    return {
      affectedRows: removedAlertRows,
      details: { removedAlertRows, sourceTypes: sourceTypes.length },
    };
  },
};
