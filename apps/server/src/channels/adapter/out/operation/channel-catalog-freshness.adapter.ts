import { Inject, Injectable } from '@nestjs/common';
import { WING_CATALOG_DETAILS_KIND, WING_CATALOG_LIST_KIND } from '@kiditem/shared/coupang-catalog-snapshot';
import type { OperationView } from '@kiditem/shared/operation';
import {
  OPERATION_PORT,
  type OperationPort,
} from '../../../../common/operation/application/port/in/operation.port';
import type {
  ChannelCatalogFreshness,
  ChannelCatalogFreshnessPort,
} from '../../../application/port/in/channel-catalog-freshness.port';

/** 계정 하나의 최신 동기화 끝을 찾을 때 훑는 최근 성공 실행 수. 한 조직의 Wing 계정은 몇 개뿐이다. */
const RECENT_SCAN = 50;

/**
 * 카탈로그 신선도 = 그 계정의 마지막 동기화 연쇄가 끝난 시각(KID-354): 바뀐 게 없어 목록에서 끝난 목록 실행
 * (`result.next === null`) 또는 목록이 이은 상세 실행(`plan.via === 'list'`) 가운데 가장 늦게 성공한 것. 상품 하나
 * 다시 받기(`via: 'manual'`)와 엑셀은 동기화가 아니다. 실행 표는 실행 계약의 reader(`OperationPort.list`)로만 읽는다
 * (ADR-0025). 끝난 실행은 잠금을 놓으므로 계정은 plan의 `channelAccountId`로 가린다.
 */
@Injectable()
export class ChannelCatalogFreshnessAdapter implements ChannelCatalogFreshnessPort {
  constructor(@Inject(OPERATION_PORT) private readonly operations: OperationPort) {}

  async catalogFreshness(input: { organizationId: string; channelAccountId: string }): Promise<ChannelCatalogFreshness> {
    const { operations } = await this.operations.list(input.organizationId, {
      kinds: [WING_CATALOG_LIST_KIND, WING_CATALOG_DETAILS_KIND],
      status: 'succeeded',
      limit: RECENT_SCAN,
    });
    const accountId = input.channelAccountId.toLowerCase();
    const ends = operations.filter((operation) => operation.plan?.channelAccountId === accountId && endsSync(operation));
    const latest = ends.reduce<string | null>((max, operation) => {
      const finishedAt = operation.finishedAt ? new Date(operation.finishedAt).toISOString() : null;
      return finishedAt && (!max || finishedAt > max) ? finishedAt : max;
    }, null);
    return { syncedAt: latest };
  }
}

function endsSync(operation: OperationView): boolean {
  if (operation.kind === WING_CATALOG_DETAILS_KIND) return operation.plan?.via === 'list';
  return operation.kind === WING_CATALOG_LIST_KIND && operation.result !== null && operation.result.next === null;
}
