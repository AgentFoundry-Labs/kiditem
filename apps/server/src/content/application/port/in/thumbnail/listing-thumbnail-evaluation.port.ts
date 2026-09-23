import type { ListingThumbnailEvaluationMethod, ListingThumbnailGrade } from '../../../../domain/thumbnail/listing-thumbnail-grade';

export const LISTING_THUMBNAIL_EVALUATION_PORT = Symbol('LISTING_THUMBNAIL_EVALUATION_PORT');

/**
 * 몰에 실제 등록된 리스팅 대표이미지의 평가(KID-313 W3a, Content 소유 `listing_thumbnail_evaluations`).
 * 분석 대상은 Channels 가 보고한 `channel_listings.image_url` 이고 Content 는 리스팅 id 와 URL 만 받는다 —
 * 리스팅 표를 직접 읽지 않는다. 같은 (리스팅, URL) 은 한 번만 평가하고, 이미지가 바뀌면 새 행이 생긴다.
 * 옛 `thumbnail_analyses`(워크스페이스당 한 행, 규칙 · 품질 · 준수 · recompose 혼재)를 대신한다.
 */

export interface ListingThumbnailEvaluationView {
  id: string;
  channelListingId: string;
  imageUrl: string;
  grade: ListingThumbnailGrade;
  score: number;
  /** 5축 점수 · 준수 · issues · suggestions 한 JSON. */
  details: Record<string, unknown>;
  method: ListingThumbnailEvaluationMethod;
  modelId: string | null;
  evaluatedAt: Date;
}

export interface ListingThumbnailEvaluationPort {
  /** 그 (리스팅, URL) 에 평가가 없으면 vision provider 로 평가해 저장하고, 있으면 그것을 돌려준다. `modelId` 는 명시(모델 선택 필수). */
  evaluate(input: {
    organizationId: string;
    channelListingId: string;
    imageUrl: string;
    modelId: string;
  }): Promise<ListingThumbnailEvaluationView>;
  /** 리스팅들의 현재 이미지 평가(있는 것만). 요약(등급 분포)은 호출자가 이 결과로 센다. */
  readCurrent(input: {
    organizationId: string;
    listings: ReadonlyArray<{ channelListingId: string; imageUrl: string | null }>;
  }): Promise<ReadonlyMap<string, ListingThumbnailEvaluationView>>;
}
