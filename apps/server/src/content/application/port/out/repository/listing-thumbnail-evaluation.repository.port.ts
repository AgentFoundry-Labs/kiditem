import type { ListingThumbnailEvaluationView } from '../../in/thumbnail/listing-thumbnail-evaluation.port';

export const LISTING_THUMBNAIL_EVALUATION_REPOSITORY_PORT = Symbol('LISTING_THUMBNAIL_EVALUATION_REPOSITORY_PORT');

/** `listing_thumbnail_evaluations` 저장소(KID-313 W3a). (조직, 리스팅, 이미지 URL) 하나에 한 행이다. */
export interface ListingThumbnailEvaluationRepositoryPort {
  find(input: { organizationId: string; channelListingId: string; imageUrl: string }): Promise<ListingThumbnailEvaluationView | null>;
  /** 새 평가를 넣는다. 같은 (리스팅, URL) 을 동시에 평가했으면 먼저 들어간 행을 돌려준다. */
  insert(input: Omit<ListingThumbnailEvaluationView, 'id' | 'evaluatedAt'> & { organizationId: string }): Promise<ListingThumbnailEvaluationView>;
  /** (리스팅, URL) 쌍마다 있는 평가. */
  findMany(input: {
    organizationId: string;
    pairs: ReadonlyArray<{ channelListingId: string; imageUrl: string }>;
  }): Promise<ListingThumbnailEvaluationView[]>;
}
