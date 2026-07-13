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
  sourceCandidateId: string;
  channelAccountId: string;
  sourceContentWorkspaceId: string;
  channelListingId: string | null;
  displayName: string;
  status: string;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedDetailPageGenerationId: string | null;
  registrationInput: JsonValue;
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

export interface SourcingCandidateRepositoryPort {
  runInTransaction<T>(
    operation: (tx: SourcingRepositoryTransaction) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>;
  findActiveBySourceUrl(input: {
    organizationId: string;
    sourceUrl: string;
  }): Promise<CandidateRow | null>;
  upsertSourced(input: UpsertCandidateInput): Promise<CandidateRow>;
  mergeDescription(input: {
    organizationId: string;
    sourceUrl: string;
    rawData: object;
    description: string | null;
    thumbnailUrl: string | null;
    imageUrl: string | null;
    images: UpsertCandidateInput['images'];
  }): Promise<CandidateRow | null>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<(CandidateRow & {
    images: CandidateImageRow[];
    productPreparation: ProductPreparationRow | null;
    productPreparations: ProductPreparationRow[];
  }) | null>;
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
      productPreparations: ProductPreparationRow[];
    }>;
    total: number;
  }>;
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
}
