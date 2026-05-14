import type { Prisma } from '@prisma/client';

export const SOURCING_CANDIDATE_REPOSITORY_PORT = Symbol('SOURCING_CANDIDATE_REPOSITORY_PORT');

export interface CandidateRow {
  id: string;
  organizationId: string;
  sourceUrl: string;
  sourcePlatform: string;
  rawData: Prisma.JsonValue;
  name: string;
  description: string;
  category: string | null;
  tags: Prisma.JsonValue;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  costCny: Prisma.Decimal | number | null;
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

export interface SourcingCandidateRepositoryPort {
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
  findById(id: string, organizationId: string): Promise<(CandidateRow & { images: CandidateImageRow[] }) | null>;

  /** List active candidates (status='sourced', isDeleted=false). */
  listSourced(query: {
    organizationId: string;
    page: number;
    limit: number;
    sort: 'newest' | 'oldest' | 'name_asc';
    platform?: string;
  }): Promise<{ items: Array<CandidateRow & { images: CandidateImageRow[] }>; total: number }>;
}
