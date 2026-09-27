import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

/**
 * 몰 관리자 가져오기(`mall_admin_listings`)가 옛 attempt 시절 알림 행에 적던 `sourceType` — v0.1.31의 한 순간이라
 * 문자열로 적는다. wave4(KID-381)에서 16곳 모두 실행 kind `channels.mall_admin_listings`로 옮겨 알림 행을 쓰지도
 * 닫지도 않으며, 실패는 알림 reader가 실행 표에서 읽는다(KID-355 정책 B).
 *
 * `032`에 이 이름을 더하지 않고 단계를 따로 두는 까닭: `032`는 이미 돌아간 DB가 있고(로컬 QA·#581 뒤 배포), 러너는
 * 성공한 단계를 다시 돌리지 않는다(source drift만 기록). 새 정리는 새 id로만 돈다.
 */
export const RETIRED_MALL_ADMIN_LISTING_SOURCE_TYPES = ['mall_admin_listings'] as const;

const SOURCE_FAILURE_ALERT_TYPE = 'source_failure';

/** `032`와 같은 규칙으로 지운다 — 새 계약이 나타낼 수 없는 행에 새 상태를 지어 붙이지 않는다. 다시 돌리면 지울 행이 없다. */
export const removeRetiredMallAdminListingAlertsMigration: DataMigration = {
  id: 'v0.1.31:033_remove_retired_mall_admin_listing_alerts',
  releaseVersion: '0.1.31',
  name: 'Remove source-failure alerts of mall admin listings moved to the operation contract',
  phase: 'post-schema',
  async run(tx: Prisma.TransactionClient): Promise<MigrationResult> {
    const sourceTypes = [...RETIRED_MALL_ADMIN_LISTING_SOURCE_TYPES];
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
