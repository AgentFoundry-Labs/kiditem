export const CANDIDATE_CONTENT_ASSET_PORT = Symbol('CANDIDATE_CONTENT_ASSET_PORT');

/**
 * Registration-ready images for one sourcing candidate, split by
 * `ContentAsset.role`.
 *
 * `role = 'source'` is deliberately dropped: those rows are the untouched
 * scrape originals (1688/Coupang CDN) and do not meet the Coupang 1,000x1,000
 * product-image spec. `ContentAsset.width/height` are NULL across the table, so
 * role is the only usable selector.
 */
export interface CandidateRegistrationImages {
  primary: string[];
  thumbnail: string[];
  detail: string[];
}

/**
 * The candidate's saved representative thumbnail, owned by its content
 * workspace (`ContentWorkspace.currentThumbnailSelectionId`).
 *
 * A candidate with no `ProductPreparation` has nowhere else to record one, so
 * this is the only way the saved selection survives a reload.
 */
export interface CandidateCurrentThumbnail {
  url: string;
  sourceThumbnailGenerationId: string | null;
  sourceThumbnailCandidateId: string | null;
}

export interface CandidateContentAssetPort {
  loadRegistrationMedia(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<{
    registrationImages: CandidateRegistrationImages;
    currentThumbnail: CandidateCurrentThumbnail | null;
  }>;
  listRegistrationImages(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateRegistrationImages>;
  findCurrentThumbnail(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateCurrentThumbnail | null>;
  /**
   * `findCurrentThumbnail` 의 배치판. 수집상품 목록처럼 후보 여러 개의 대표를
   * 한 번에 읽어야 하는 경로 전용이다 — 단건 조회를 반복하면 N+1 이 된다.
   * 대표가 없는 후보는 맵에 없다.
   */
  findCurrentThumbnails(input: {
    organizationId: string;
    sourceCandidateIds: string[];
  }): Promise<Map<string, CandidateCurrentThumbnail>>;
}
