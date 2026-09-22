import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { ProductPreparationRow } from '../../../../../channels/application/port/in/candidate-registration.port';
export type { ProductPreparationRow } from '../../../../../channels/application/port/in/candidate-registration.port';
import type { SourcingRepositoryTransaction } from '../transaction/repository-transaction';
import type { CandidateRegistrationState } from '../../../../../channels/read/registration-execution.reader';

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
  externalOfferId: string | null;
  variantKeyNormalized: string;
  sourceIdentityHash: string | null;
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



export interface UpsertCandidateInput {
  organizationId: string;
  /** Optional for legacy owner paths; Agent capability writes pass an exact owner key. */
  idempotencyKey?: string;
  sourceUrl: string;
  sourcePlatform: string;
  externalOfferId?: string | null;
  variantKeyNormalized?: string;
  sourceIdentityHash?: string | null;
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

/** Immutable Sourcing-owned outcome for a final capability owner call. */
export interface UpsertCandidateWithIdempotencyReceiptInput
  extends Omit<UpsertCandidateInput, 'idempotencyKey'> {
  capabilityKey: string;
  idempotencyKey: string;
  requestHash: string;
}

export interface SourcingCandidateStateRow {
  id: string;
  status: string;
}

export interface SourcingCandidateRepositoryPort {
  runInTransaction<T>(
    operation: (tx: SourcingRepositoryTransaction, ownerTransaction: OwnerTransaction) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>;
  findActiveBySourceUrl(input: {
    organizationId: string;
    sourceUrl: string;
  }): Promise<CandidateRow | null>;
  upsertSourced(input: UpsertCandidateInput): Promise<CandidateRow>;
  upsertSourcedWithIdempotencyReceipt(
    input: UpsertCandidateWithIdempotencyReceiptInput,
  ): Promise<{ candidateId: string }>;
  claimQuickProcessCandidate(input: {
    organizationId: string;
    candidateId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ candidateId: string }>;
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
    registrationTarget: ProductPreparationRow | null;
    productPreparations: ProductPreparationRow[];
    registrationState: CandidateRegistrationState;
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
      registrationTarget: ProductPreparationRow | null;
      productPreparations: ProductPreparationRow[];
      registrationState: CandidateRegistrationState;
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
