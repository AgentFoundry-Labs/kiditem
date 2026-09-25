'use client';

import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { invalidateSourcingReads, sourcingOperationCollection } from './sourcing-operations';

/**
 * 1688 인기상품 수집(`sourcing.trend_1688`, KID-360). 키워드는 조직의 트렌드 시드에서 서버가 정하므로 scope는
 * 비어 있다. 결정 센터의 공급 CTA가 시작하고, 공용 컨트롤이 도는 실행과 중단을 보인다. 끝나면 결정 센터가 읽는
 * 공급 후보를 다시 읽는다.
 */
export const sourcing1688TrendCollection = sourcingOperationCollection({
  kind: SOURCING_OPERATION_KINDS.trend1688,
  sourceKey: SOURCING_OPERATION_KINDS.trend1688,
  label: '1688 공급 후보 수집',
  scope: () => ({}),
  onNewComplete: invalidateSourcingReads,
});
