import type {
  ThumbnailExecutionListingChoice,
  ThumbnailExecutionStatus,
} from '@kiditem/shared/thumbnail-execution';
import type { RegistrationThumbnailPayload } from '@kiditem/shared/channels-operations';

export const CHANNELS_THUMBNAIL_EXECUTION_PORT = Symbol('CHANNELS_THUMBNAIL_EXECUTION_PORT');

/** 대표이미지 반영 실행 하나가 얼리는 것: 계정과 확장에 넘길 사진(plan `payload`). */
export interface ThumbnailExecutionPlan {
  channelAccountId: string;
  payload: RegistrationThumbnailPayload;
}

/**
 * 대표이미지 몰 반영(`channels.registration` 의 `thumbnail_update`, KID-364). 실행 자체는 실행 계약이 갖고, 여기는
 * 판매 상품의 계정 · listing 과 올릴 자산을 정해 사진을 얼리고(요청의 자산 → 그 계정 등록 대상이 고른 자산 → 작업공간의
 * 현재 대표이미지, KID-313 W3a), 판매 상품마다 가장 최근 실행과 고를 listing 을 읽는다. 올린 것은 저장이 아니므로 확장은
 * `reconciling` 으로 멈추고, 운영자가 몰에서 저장을 확인해야(`confirm`) 성공이다.
 */
export interface ChannelsThumbnailExecutionPort {
  plan(input: {
    organizationId: string;
    salesProductId: string;
    assetId?: string;
    channelListingId?: string;
  }): Promise<ThumbnailExecutionPlan>;
  listLatest(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ThumbnailExecutionStatus[]>;
  /** 운영자가 고를 수 있는 이 판매 상품의 대표이미지 지원 listing. */
  listingChoices(input: { organizationId: string; salesProductId: string }): Promise<ThumbnailExecutionListingChoice[]>;
}
