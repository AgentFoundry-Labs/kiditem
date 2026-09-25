import { Inject, Injectable } from '@nestjs/common';
import { WING_CATALOG_DETAILS_KIND } from '@kiditem/shared/coupang-catalog-snapshot';
import {
  OPERATION_PORT,
  type OperationPort,
} from '../../../../common/operation/application/port/in/operation.port';
import type {
  ChannelCatalogFreshness,
  ChannelCatalogFreshnessPort,
} from '../../../application/port/in/channel-catalog-freshness.port';

/** 계정 하나의 최신 성공을 찾을 때 훑는 최근 상세 실행 수. 한 조직의 Wing 계정은 몇 개뿐이다. */
const RECENT_DETAILS_SCAN = 50;

/**
 * 카탈로그 신선도 = 그 계정의 `channels.wing_catalog_details` 최신 성공 시각(KID-354). 실행 표는 실행 계약의
 * reader(`OperationPort.list`)로만 읽는다 — owner가 실행 행을 직접 만지지 않는다(ADR-0025). 끝난 실행은 잠금을
 * 놓으므로 계정은 plan의 `channelAccountId`로 가린다.
 */
@Injectable()
export class ChannelCatalogFreshnessAdapter implements ChannelCatalogFreshnessPort {
  constructor(@Inject(OPERATION_PORT) private readonly operations: OperationPort) {}

  async catalogFreshness(input: { organizationId: string; channelAccountId: string }): Promise<ChannelCatalogFreshness> {
    const { operations } = await this.operations.list(input.organizationId, {
      kinds: [WING_CATALOG_DETAILS_KIND],
      status: 'succeeded',
      limit: RECENT_DETAILS_SCAN,
    });
    const accountId = input.channelAccountId.toLowerCase();
    const latest = operations.find((operation) => operation.plan?.channelAccountId === accountId);
    return { syncedAt: latest?.finishedAt ? new Date(latest.finishedAt).toISOString() : null };
  }
}
