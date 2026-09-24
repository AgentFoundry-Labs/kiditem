export const CHANNELS_REPRESENTATIVE_IMAGE_CAPABILITY_PORT = Symbol(
  'CHANNELS_REPRESENTATIVE_IMAGE_CAPABILITY_PORT',
);

/**
 * Agent 가 받는 영수증. 사진은 몰 수정 화면에 올라갈 뿐이라, 운영자가 웹에서 반영을 확인하기
 * 전까지 `success: false` · `status: 'awaiting_operator_confirmation'` 이다.
 */
export type RepresentativeImageCapabilityResult =
  | { success: true; status: 'succeeded'; screenshotPath: string | null }
  | { success: false; status: 'awaiting_operator_confirmation'; screenshotPath: string | null };

export interface ChannelsRepresentativeImageCapabilityPort {
  submitRepresentativeImage(input: {
    organizationId: string;
    /** 대표이미지를 올릴 판매 상품. 자산을 고르지 않으면 등록 대상이 고른 자산, 없으면 작업공간의 현재 대표이미지. */
    salesProductId: string;
    assetId?: string;
    triggeredByUserId?: string | null;
    ownerIdempotencyKey: string;
    requestHash: string;
  }): Promise<RepresentativeImageCapabilityResult>;
}
