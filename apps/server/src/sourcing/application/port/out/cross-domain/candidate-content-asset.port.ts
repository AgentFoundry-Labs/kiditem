export const SOURCING_CANDIDATE_CONTENT_ASSET_PORT = Symbol(
  'SOURCING_CANDIDATE_CONTENT_ASSET_PORT',
);

/**
 * Registration images owned by the candidate's content workspace, split by
 * `ContentAsset.role`. `source` role assets are never returned — they are the
 * raw scrape originals and do not meet the Coupang product-image spec.
 */
export interface CandidateRegistrationImages {
  primary: string[];
  thumbnail: string[];
  detail: string[];
}

/**
 * The candidate's saved representative thumbnail, owned by its AI content
 * workspace. Sourcing reads it as a fallback for
 * `ProductPreparation.selectedThumbnailUrl`: a candidate with no preparation
 * can only save a representative through the workspace, so without this the
 * saved selection is lost on every reload.
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
   * 배치판. 수집상품 **목록**은 카드마다 저장된 대표를 보여줘야 하는데,
   * 후보별 단건 조회를 돌리면 N+1 이 된다. 목록 경로는 이쪽만 쓴다.
   * 대표가 없는 후보는 맵에 없다.
   */
  findCurrentThumbnails(input: {
    organizationId: string;
    sourceCandidateIds: string[];
  }): Promise<Map<string, CandidateCurrentThumbnail>>;
}
