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

export interface CandidateContentAssetPort {
  listRegistrationImages(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateRegistrationImages>;
}
