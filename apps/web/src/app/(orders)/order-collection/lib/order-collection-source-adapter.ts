import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import type { MallOrderCollectionStartInput } from './mall-order-collection-source';

/**
 * 몰 카드가 이 수집 원천을 어떻게 세우는가.
 *
 * 카드와 수집 루프가 몰 키를 비교하던 동안, 원천 하나(쿠팡 직배송)의 사정이 루프 · 화면 ·
 * 카드에 흩어져 루프를 고칠 때마다 그 원천을 따로 검증해야 했다(KID-255). 무엇을 먼저
 * 고르는지도, 왜 아직 시작할 수 없는지도 원천이 제 안에서 답한다.
 */
export type OrderCollectionCardPolicy = Readonly<{
  /** 카드 영역을 누르면 무엇을 수집할지 먼저 고르는 화면이 열리는가(직배송 입고예정일 달력). */
  opensChooser: boolean;
  /**
   * 이 원천만의 시작 불가 사유. 화면이 모든 몰에 똑같이 대는 사유(중지된 계정 · 자동 수집
   * 준비 중)가 먼저고, 그것이 없을 때 이 사유가 선다.
   */
  startBlockedReason: string | null;
}>;

/**
 * 주문 수집 화면이 쓰는 수집 원천 하나 — 공용 컨트롤의 시작 · 상태 · 중단(`CollectionSourceAdapter`)에
 * 이 화면이 더 묻는 것을 얹는다. 화면과 루프는 이 답만 보고, 원천이 어느 몰인지는 묻지 않는다.
 */
export type OrderCollectionSourceAdapter<TStatus> = CollectionSourceAdapter<
  TStatus,
  MallOrderCollectionStartInput
> &
  Readonly<{
    card: OrderCollectionCardPolicy;
  }>;
