import type { AdTrafficSourcePublished } from '@kiditem/shared/advertising-operations';

export const AD_TRAFFIC_READ_PORT = Symbol('AD_TRAFFIC_READ_PORT');

/**
 * Wing 트래픽 원장 읽기(Analytics·Finance). 날짜마다 그 날을 확정한 가장 최근 성공 `advertising.wing_traffic`
 * 실행의 계정 요약을 읽는다(KID-362). 계정을 주지 않으면 대표 쿠팡 계정.
 */
export interface AdTrafficReadPort {
  readPublished(input: {
    organizationId: string;
    channelAccountId?: string;
    from?: string;
    to?: string;
  }): Promise<AdTrafficSourcePublished>;
}
