import { channelCollectsViaExtension } from '@kiditem/shared/channel-registry';
import type { OrderCollectionMallAccount } from '../../order-collection/lib/order-mall-account-api';
import { isTrackingSupportedMall } from '../../order-collection/lib/icecream-tracking-api';

export interface MallCapabilities {
  /** 주문수집 파이프라인이 붙어 있는 몰. */
  collection: boolean;
  /** 송장 등록(발송처리) 파이프라인이 붙어 있는 몰. */
  tracking: boolean;
}

/**
 * "계정만 채우면 이 기능을 쓸 수 있는가" 를 본다 — 쇼핑몰 계정 화면의 2칸 시야다.
 * `/mall-channels` 의 9칸 시야(`(channels)/_shared/mall-capabilities.ts`)와 같은
 * 레지스트리를 읽되, 여기서는 계정을 채우면 되는 두 가지만 남긴다.
 *
 * `tracking` 은 레지스트리의 `uploadTracking`(확장이 몰에 직접 등록하는 셋)보다 넓다.
 * 이 화면의 버튼은 셀피아 채번 송장을 몰 것으로 골라 CSV 로도 내려주므로, 판매처명
 * 매핑이 있으면 할 일이 있다.
 */
export function mallCapabilities(mallKey: string): MallCapabilities {
  return {
    collection: channelCollectsViaExtension(mallKey),
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
