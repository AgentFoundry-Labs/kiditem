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

export interface CandidateContentAssetPort {
  listRegistrationImages(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateRegistrationImages>;
}
