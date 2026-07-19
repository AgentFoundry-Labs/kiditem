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
  listRegistrationImages(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateRegistrationImages>;
  findCurrentThumbnail(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateCurrentThumbnail | null>;
}
