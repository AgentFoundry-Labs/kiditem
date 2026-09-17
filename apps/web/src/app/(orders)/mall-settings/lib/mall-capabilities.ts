import type { OrderCollectionMallAccount } from '../../order-collection/lib/order-mall-account-api';
import { isBrowserCollectableMall } from '../../order-collection/lib/order-collection-page-model';
import { isTrackingSupportedMall } from '../../order-collection/lib/icecream-tracking-api';

export interface MallCapabilities {
  /** 주문수집 파이프라인이 붙어 있는 몰. */
  collection: boolean;
  /** 송장 등록(발송처리) 파이프라인이 붙어 있는 몰. */
  tracking: boolean;
}

/**
 * "계정만 채우면 이 기능을 쓸 수 있는가" 를 본다.
 *
 * 수집 판정은 아이스크림몰만 설정·사용 여부까지 함께 보므로, 여기서는 그 두
 * 조건을 채운 가상 계정을 넣어 순수한 지원 여부만 남긴다. 지원 몰 목록을 이
 * 파일에 다시 적으면 실제 판정과 갈라지므로 그렇게 하지 않는다.
 */
export function mallCapabilities(mallKey: string): MallCapabilities {
  const configuredProbe = {
    key: mallKey,
    configured: true,
    enabled: true,
  } as OrderCollectionMallAccount;
  return {
    collection: isBrowserCollectableMall(configuredProbe),
    tracking: isTrackingSupportedMall(mallKey),
  };
}

export type MallReadiness = 'ready' | 'needs_account' | 'paused' | 'preparing';

/**
 * 표에 한 줄로 보여줄 상태.
 *
 * 아직 파이프라인이 없는 몰은 계정을 채워도 쓸 수 없으므로 '준비 중' 이 먼저다.
 */
export function mallReadiness(account: OrderCollectionMallAccount): MallReadiness {
  if (!mallCapabilities(account.key).collection) return 'preparing';
  if (!account.configured) return 'needs_account';
  if (!account.enabled) return 'paused';
  return 'ready';
}

export const MALL_READINESS_LABEL: Record<MallReadiness, string> = {
  ready: '사용 중',
  needs_account: '계정 필요',
  paused: '중지',
  preparing: '준비 중',
};
