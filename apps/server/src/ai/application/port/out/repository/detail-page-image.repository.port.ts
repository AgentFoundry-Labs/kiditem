export const DETAIL_PAGE_IMAGE_REPOSITORY_PORT = Symbol(
  'DETAIL_PAGE_IMAGE_REPOSITORY_PORT',
);

export const DETAIL_PAGE_IMAGE_ACTIVE_INTENT_STATES = [
  'issued',
  'claimed',
  'uploaded',
] as const;

export interface DetailPageImageArtifactRecord {
  id: string;
  organizationId: string;
  revisionId: string;
  variant: string;
  outputWidth: number;
  objectKey: string;
  imageUrl: string;
  contentType: string;
  byteLength: number;
  pixelWidth: number;
  pixelHeight: number;
  sha256: string;
  rendererKind: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DetailPageImageRenderIntentRecord {
  id: string;
  organizationId: string;
  sourceCandidateId: string;
  detailPageArtifactId: string;
  revisionId: string;
  variant: string;
  outputWidth: number;
  objectKey: string;
  state: string;
  attempt: number;
  expiresAt: Date;
  requestedByUserId: string | null;
  claimedByUserId: string | null;
  claimedAt: Date | null;
  uploadedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  completedArtifactId: string | null;
  completedArtifact?: DetailPageImageArtifactRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DetailPageImageIntentClaimResult =
  | { status: 'claimed'; intent: DetailPageImageRenderIntentRecord }
  | { status: 'conflict'; intent: DetailPageImageRenderIntentRecord }
  | { status: 'missing' };

export interface DetailPageImageRepositoryPort {
  findArtifact(input: {
    organizationId: string;
    revisionId: string;
    variant: string;
    outputWidth: number;
  }): Promise<DetailPageImageArtifactRecord | null>;
  findActiveIntent(input: {
    organizationId: string;
    sourceCandidateId: string;
    revisionId: string;
    variant: string;
    outputWidth: number;
    now: Date;
  }): Promise<DetailPageImageRenderIntentRecord | null>;
  createIntent(input: {
    organizationId: string;
    sourceCandidateId: string;
    detailPageArtifactId: string;
    revisionId: string;
    variant: string;
    outputWidth: number;
    objectKey: string;
    requestedByUserId: string;
    expiresAt: Date;
  }): Promise<DetailPageImageRenderIntentRecord>;
  findIntent(input: {
    organizationId: string;
    intentId: string;
  }): Promise<DetailPageImageRenderIntentRecord | null>;
  claimIntent(input: {
    organizationId: string;
    intentId: string;
    userId: string;
    claimedAt: Date;
  }): Promise<DetailPageImageIntentClaimResult>;
  completeIntent(input: {
    organizationId: string;
    intentId: string;
    imageUrl: string;
    contentType: string;
    byteLength: number;
    pixelWidth: number;
    pixelHeight: number;
    sha256: string;
    rendererKind: string;
    createdByUserId: string;
    completedAt: Date;
  }): Promise<DetailPageImageArtifactRecord | null>;
  failIntent(input: {
    organizationId: string;
    intentId: string;
    failureCode: string;
    failureMessage: string;
    failedAt: Date;
  }): Promise<DetailPageImageRenderIntentRecord | null>;
  expireIntent(input: {
    organizationId: string;
    intentId: string;
    expiredAt: Date;
  }): Promise<void>;
}
