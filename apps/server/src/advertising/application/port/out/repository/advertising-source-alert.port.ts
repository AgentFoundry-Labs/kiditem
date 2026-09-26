import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const ADVERTISING_SOURCE_ALERT_PORT = Symbol('ADVERTISING_SOURCE_ALERT_PORT');

/** 수집 kind 하나의 실패 알림(옛 attempt의 dedupeKey·sourceType을 그대로 쓴다 — 열린 알림이 이어진다). */
export interface AdvertisingSourceAlert {
  sourceType: string;
  dedupeKey: string;
  title: string;
  href: string;
}

/**
 * 광고 수집 kind의 원천 실패 알림(KID-362). 최종 실패는 finish 트랜잭션에서 알림을 남기고(취소는 알림 서비스가 거른다),
 * 성공한 finalize는 같은 트랜잭션에서 열린 알림을 닫는다.
 */
export interface AdvertisingSourceAlertPort {
  recordFailure(tx: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    alert: AdvertisingSourceAlert;
    code: string;
    message: string;
  }): Promise<void>;
  resolve(tx: OwnerTransaction, input: { organizationId: string; operationId: string; alert: AdvertisingSourceAlert }): Promise<void>;
}
