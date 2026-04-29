import { Prisma } from '@prisma/client';
import type {
  EditAnalysisResult,
  ThumbnailGenerationItem,
  ThumbnailPhase,
} from '@kiditem/shared/ai';

/**
 * Prisma row → public `ThumbnailGenerationItem` projection. Owns the status /
 * phase normalization, the registration-attempt collapse, and the candidate
 * shape used by `/api/thumbnail-analysis/generations*` and the editor flow.
 */

export type GenerationMasterSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
};

export type GenerationCandidateRow = {
  id: string;
  url: string;
  storageKey: string | null;
  filename: string | null;
  sortOrder: number;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
};

export type GenerationRegistrationAttemptRow = {
  status: string;
  errorMessage: string | null;
  finishedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

export type GenerationRow = {
  id: string;
  createdAt: Date;
  status: string;
  phase: string | null;
  grade: string;
  score: number;
  masterId: string;
  method: string;
  originalUrl: string | null;
  selectedUrl: string | null;
  prompt: string | null;
  editAnalysis: Prisma.JsonValue;
  inputMeta: Prisma.JsonValue;
  errorMessage: string | null;
  attemptCount: number;
  triggeredByUserId: string | null;
  candidates: GenerationCandidateRow[];
  registrationAttempts: GenerationRegistrationAttemptRow[];
  master?: GenerationMasterSummary | null;
};

const ALLOWED_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const;
const ALLOWED_PHASES: ThumbnailPhase[] = ['ready', 'applied'];

function toRegistrationStatus(
  status: string | undefined,
): ThumbnailGenerationItem['registrationStatus'] {
  if (status === 'uploaded' || status === 'registered' || status === 'failed') return status;
  return null;
}

function registrationCheckedAt(
  attempt: GenerationRegistrationAttemptRow | undefined,
): string | null {
  if (!attempt) return null;
  return (attempt.finishedAt ?? attempt.updatedAt ?? attempt.createdAt).toISOString();
}

export function toThumbnailGenerationItem(
  row: GenerationRow,
  master: GenerationMasterSummary | null | undefined = row.master,
): ThumbnailGenerationItem {
  const status = (ALLOWED_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as ThumbnailGenerationItem['status'])
    : 'failed';
  const phase = row.phase && (ALLOWED_PHASES as readonly string[]).includes(row.phase)
    ? (row.phase as ThumbnailPhase)
    : null;
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    status,
    phase,
    grade: row.grade,
    score: row.score,
    productId: row.masterId,
    method: row.method,
    originalUrl: row.originalUrl,
    selectedUrl: row.selectedUrl,
    candidates: row.candidates.map((c) => ({
      id: c.id,
      url: c.url,
      storageKey: c.storageKey,
      filename:
        c.filename ?? c.storageKey?.split('/').pop() ?? c.url.split('/').pop() ?? 'thumbnail',
      sortOrder: c.sortOrder,
    })),
    editAnalysis: (row.editAnalysis as EditAnalysisResult | null) ?? null,
    inputMeta: (row.inputMeta as Record<string, unknown> | null) ?? null,
    errorMessage: row.errorMessage,
    attemptCount: row.attemptCount,
    triggeredByUserId: row.triggeredByUserId ?? null,
    registrationStatus: toRegistrationStatus(row.registrationAttempts[0]?.status),
    registrationCheckedAt: registrationCheckedAt(row.registrationAttempts[0]),
    registrationError: row.registrationAttempts[0]?.errorMessage ?? null,
    product: {
      id: master?.id ?? row.masterId,
      name: master?.name ?? '',
      imageUrl: master?.imageUrl ?? null,
      coupangProductId: null,
      category: master?.category ?? null,
    },
  } satisfies ThumbnailGenerationItem;
}
