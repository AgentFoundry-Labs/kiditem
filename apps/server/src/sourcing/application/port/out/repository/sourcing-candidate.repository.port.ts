import type { SourcingRepositoryTransaction } from '../transaction/repository-transaction';

export const SOURCING_CANDIDATE_REPOSITORY_PORT = Symbol('SOURCING_CANDIDATE_REPOSITORY_PORT');

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export interface CandidateRow {
  id: string;
  organizationId: string;
  sourceUrl: string;
  sourcePlatform: string;
  rawData: JsonValue;
  name: string;
  description: string;
  category: string | null;
  tags: JsonValue;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  costCny: number | { toString(): string } | null;
  status: string;
  promotedMasterId: string | null;
  rejectedReason: string | null;
  rejectedAt: Date | null;
  rejectedByUserId: string | null;
  triggeredByUserId: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CandidateImageRow {
  id: string;
  organizationId: string;
  candidateId: string;
  url: string;
  storageKey: string | null;
  role: string;
  label: string | null;
  sortOrder: number;
  source: string;
  isPrimary: boolean;
  isDeleted: boolean;
}

export interface ProductPreparationRow {
  id: string;
  sourceCandidateId: string | null;
  masterId: string | null;
  contentWorkspaceId: string | null;
  displayName: string;
  status: string;
  isCurrentForMaster: boolean;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedDetailPageGenerationId: string | null;
  registrationInput: JsonValue;
  appliedToMasterAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertCandidateInput {
  organizationId: string;
  sourceUrl: string;
  sourcePlatform: string;
  rawData: object;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  imageUrl: string | null;
  costCny: number | null;
  triggeredByUserId: string | null;
  images: Array<{
    url: string;
    role: string;
    label: string | null;
    sortOrder: number;
    source: string;
    isPrimary: boolean;
  }>;
}

export interface SourcingCandidateStateRow {
  id: string;
  status: string;
}

export interface PromotionCandidateImageRow {
  url: string;
  storageKey: string | null;
  sortOrder: number;
  isPrimary: boolean;
  source: string;
  role: string;
  label: string | null;
}

export interface LockedPromotionCandidateRow {
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: JsonValue;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  status: string;
  promotedMasterId: string | null;
  images: PromotionCandidateImageRow[];
}

export interface PromotionPreparationSelectionRow {
  registrationInput: JsonValue;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageGenerationId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
}

export interface SelectedThumbnailGenerationRow {
  id: string;
  generationId: string;
  url: string;
  storageKey: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  contentWorkspaceId: string | null;
}

export interface SelectedDetailPageRow {
  artifactId: string;
  revisionId: string | null;
  contentGenerationId: string | null;
  contentWorkspaceId: string | null;
}

export interface CandidateForPreparationRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: JsonValue;
  rawData: JsonValue;
  promotedMasterId: string | null;
}

export interface PreparationSelectionRow {
  id: string;
  registrationInput: JsonValue;
}

export interface PreparationThumbnailSelectionRow {
  id: string;
  generationId: string;
  contentWorkspaceId: string | null;
}

export interface PreparationDetailPageSelectionRow {
  id: string;
  contentWorkspaceId: string | null;
  artifactId: string | null;
  revisionId: string | null;
}

export interface UpsertPreparationInput {
  organizationId: string;
  candidate: CandidateForPreparationRow;
  data: Record<string, unknown>;
}

export interface UpsertPromotedProductPreparationInput {
  organizationId: string;
  candidateId: string;
  masterId: string;
  contentWorkspaceId: string | null;
  displayName: string;
  registrationInput: Record<string, unknown>;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedDetailPageGenerationId: string | null;
  appliedToMasterAt: Date;
}

export interface SourcingCandidateRepositoryPort {
  runInTransaction<T>(
    operation: (tx: SourcingRepositoryTransaction) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>;

  /** Idempotent upsert by (organizationId, sourceUrl) where status='sourced' AND is_deleted=false. */
  upsertSourced(input: UpsertCandidateInput): Promise<CandidateRow>;

  /** Merge description data into an existing sourced candidate found by sourceUrl. Returns null if none. */
  mergeDescription(input: {
    organizationId: string;
    sourceUrl: string;
    rawData: object;
    description: string | null;
    thumbnailUrl: string | null;
    imageUrl: string | null;
    images: UpsertCandidateInput['images'];
  }): Promise<CandidateRow | null>;

  /** IDOR-scoped read. */
  findById(
    id: string,
    organizationId: string,
  ): Promise<(CandidateRow & {
    images: CandidateImageRow[];
    productPreparation: ProductPreparationRow | null;
  }) | null>;

  /** List active marketplace-unlisted candidates (status sourced/promoted, no active listing). */
  listSourced(query: {
    organizationId: string;
    page: number;
    limit: number;
    sort: 'newest' | 'oldest' | 'name_asc';
    platform?: string;
    sourcePlatforms?: string[];
  }): Promise<{
    items: Array<CandidateRow & {
      images: CandidateImageRow[];
      productPreparation: ProductPreparationRow | null;
    }>;
    total: number;
  }>;

  /** Archive an active sourcing inbox workspace root and its source images. */
  archiveSourcedWorkspace(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string; archivedAt: Date },
  ): Promise<{ archivedCandidate: boolean; archivedCandidateImages: number }>;

  findCandidateState(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string },
  ): Promise<SourcingCandidateStateRow | null>;

  lockCandidate(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string },
  ): Promise<void>;

  findLockedPromotionCandidate(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string },
  ): Promise<LockedPromotionCandidateRow | null>;

  findPromotionPreparationSelection(
    tx: SourcingRepositoryTransaction,
    input: { organizationId: string; candidateId: string },
  ): Promise<PromotionPreparationSelectionRow | null>;

  findSelectedThumbnailGeneration(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      generationCandidateId: string;
    },
  ): Promise<SelectedThumbnailGenerationRow | null>;

  findSelectedDetailPageGeneration(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      contentGenerationId: string;
    },
  ): Promise<SelectedDetailPageRow | null>;

  findSelectedDetailPageArtifact(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      artifactId: string;
    },
  ): Promise<SelectedDetailPageRow | null>;

  findDetailPageRevision(
    tx: SourcingRepositoryTransaction,
    input: { organizationId: string; artifactId: string; revisionId: string },
  ): Promise<{ id: string } | null>;

  markCandidatePromoted(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string; masterId: string },
  ): Promise<{ count: number }>;

  rejectCandidate(
    tx: SourcingRepositoryTransaction,
    input: {
      id: string;
      organizationId: string;
      reason: string | null;
      rejectedByUserId: string | null;
      rejectedAt: Date;
    },
  ): Promise<{ count: number }>;

  attachSelectedDetailPageArtifact(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      artifactId: string;
      targetMasterId: string;
      revisionId: string | null;
    },
  ): Promise<{ count: number }>;

  upsertPromotedProductPreparation(
    tx: SourcingRepositoryTransaction,
    input: UpsertPromotedProductPreparationInput,
  ): Promise<void>;

  findCandidateForPreparation(input: {
    organizationId: string;
    candidateId: string;
  }): Promise<CandidateForPreparationRow | null>;

  findActivePreparation(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<PreparationSelectionRow | null>;

  findPreparationThumbnailCandidate(input: {
    organizationId: string;
    candidate: CandidateForPreparationRow;
    generatedCandidateId: string;
  }): Promise<(PreparationThumbnailSelectionRow & { url: string }) | null>;

  findPreparationDetailPageGeneration(input: {
    organizationId: string;
    candidate: CandidateForPreparationRow;
    contentGenerationId: string;
  }): Promise<PreparationDetailPageSelectionRow | null>;

  findPreparationDetailPageRevision(input: {
    organizationId: string;
    artifactId: string;
    revisionId: string;
  }): Promise<{ id: string } | null>;

  upsertPreparation(input: UpsertPreparationInput): Promise<ProductPreparationRow>;
}
