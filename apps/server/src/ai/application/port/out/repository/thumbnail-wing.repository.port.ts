export const THUMBNAIL_WING_REPOSITORY_PORT = Symbol('THUMBNAIL_WING_REPOSITORY_PORT');

export interface ThumbnailWingGenerationCandidateRow {
  url: string | null;
}

export interface ThumbnailWingGenerationRegistrationAttemptRow {
  id: string;
  status: string;
  errorMessage: string | null;
}

export interface ThumbnailWingGenerationForRegistration {
  masterId: string | null;
  selectedUrl: string | null;
  candidates: ThumbnailWingGenerationCandidateRow[];
}

export interface ThumbnailWingGenerationForVerification {
  selectedUrl: string | null;
  registrationAttempts: ThumbnailWingGenerationRegistrationAttemptRow[];
}

export interface ThumbnailWingRegistrableMaster {
  name: string | null;
  listings?: Array<{ channelName: string | null }>;
}

export interface ThumbnailWingRegistrationAttemptPatch {
  status?: string;
  errorMessage?: string | null;
  screenshotUrl?: string | null;
  externalId?: string | null;
  finishedAt?: Date;
}

export interface ThumbnailWingRepositoryPort {
  findGenerationWithCandidates(
    generationId: string,
    organizationId: string,
  ): Promise<ThumbnailWingGenerationForRegistration | null>;
  findRegistrableMaster(
    masterId: string,
    organizationId: string,
  ): Promise<ThumbnailWingRegistrableMaster | null>;
  findGenerationWithLatestAttempt(
    id: string,
    organizationId: string,
  ): Promise<ThumbnailWingGenerationForVerification | null>;
  ensureGenerationExists(id: string, organizationId: string): Promise<void>;
  createRegistrationAttempt(
    generationId: string,
    organizationId: string,
  ): Promise<{ id: string }>;
  updateRegistrationAttemptOrThrow(
    id: string,
    organizationId: string,
    data: ThumbnailWingRegistrationAttemptPatch,
    generationId?: string,
  ): Promise<void>;
  deleteFailedRegistrationAttempts(generationId: string, organizationId: string): Promise<void>;
}
