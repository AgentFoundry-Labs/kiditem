import type { Prisma } from '@prisma/client';
import type {
  ThumbnailAnalysisListResponse,
  ThumbnailAnalysisSummary,
} from '@kiditem/shared/ai';
import type { ThumbnailMasterImageRow } from '../../../services/thumbnail-master-image-resolver';
import {
  hasActualAnalysis,
  toAnalysisResult,
  unclassifiedAnalysisResult,
} from '../../../mapper/thumbnail-analysis.mapper';

const EMPTY_GRADE_DIST = { S: 0, A: 0, B: 0, C: 0, F: 0 } as const;
const EMPTY_COMPLIANCE_DIST = { PASS: 0, WARN: 0, FAIL: 0 } as const;

export type MasterRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: ThumbnailMasterImageRow[];
  createdAt: Date;
};

/**
 * Shape of a `thumbnailAnalysis` row joined with its master subset, as used by
 * the listing read path. Field names line up with `prisma.thumbnailAnalysis`
 * + the standard master select; declared explicitly so callers don't need a
 * full Prisma payload type just to render the projection.
 */
export type AnalysisRow = {
  id: string;
  masterId: string;
  imageUrl: string | null;
  overallScore: number;
  grade: string;
  scores: Prisma.JsonValue;
  issues: Prisma.JsonValue;
  suggestions: Prisma.JsonValue;
  method: string | null;
  complianceGrade: string | null;
  complianceScores: Prisma.JsonValue;
  imageSpec: Prisma.JsonValue;
  recompose: Prisma.JsonValue;
  qualityAnalyzedAt: Date | null;
  complianceAnalyzedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  master?: {
    id: string;
    name: string;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    images: ThumbnailMasterImageRow[];
  } | null;
};

type GradeDistribution = Record<'S' | 'A' | 'B' | 'C' | 'F', number>;
type ComplianceDistribution = Record<'PASS' | 'WARN' | 'FAIL', number>;

interface DistributionTally {
  gradeDistribution: GradeDistribution;
  complianceDistribution: ComplianceDistribution;
  analyzed: number;
  partialCount: number;
}

function tallyDistributions(
  rows: ReadonlyArray<
    Pick<
      AnalysisRow,
      'grade' | 'complianceGrade' | 'qualityAnalyzedAt' | 'complianceAnalyzedAt'
    >
  >,
): DistributionTally {
  const gradeDistribution: GradeDistribution = { ...EMPTY_GRADE_DIST };
  const complianceDistribution: ComplianceDistribution = { ...EMPTY_COMPLIANCE_DIST };
  let analyzed = 0;
  let partialCount = 0;
  for (const a of rows) {
    const hasQuality = a.qualityAnalyzedAt !== null;
    const hasCompliance = a.complianceAnalyzedAt !== null;
    if (hasQuality) {
      analyzed += 1;
      if (a.grade in gradeDistribution) {
        gradeDistribution[a.grade as keyof GradeDistribution] += 1;
      }
    }
    if (hasCompliance && a.complianceGrade && a.complianceGrade in complianceDistribution) {
      complianceDistribution[a.complianceGrade as keyof ComplianceDistribution] += 1;
    }
    if (hasQuality !== hasCompliance) partialCount += 1;
  }
  return { gradeDistribution, complianceDistribution, analyzed, partialCount };
}

/**
 * Compose the `findAllWithAnalysis` response from already-fetched master and
 * analysis rows. Ownership filtering (analysis rows whose master is not in
 * the caller-company master set are dropped) and unclassified projection
 * (masters with no quality run yet) live here so the service stays as a
 * thin Prisma orchestrator.
 */
export function buildAnalysisListResponse(
  masters: ReadonlyArray<MasterRow>,
  analyses: ReadonlyArray<AnalysisRow>,
): ThumbnailAnalysisListResponse {
  const masterById = new Map(masters.map((m) => [m.id, m]));
  const ownedAnalysisRows = analyses.filter((a) => masterById.has(a.masterId));
  const analysisByMasterId = new Map(ownedAnalysisRows.map((a) => [a.masterId, a]));
  const qualityAnalyzedMasterIds = new Set(
    ownedAnalysisRows.filter((a) => a.qualityAnalyzedAt !== null).map((a) => a.masterId),
  );

  const allResults = ownedAnalysisRows
    .filter(hasActualAnalysis)
    .map((a) => toAnalysisResult(a, masterById.get(a.masterId) ?? null));

  const unclassified = masters
    .filter((m) => !qualityAnalyzedMasterIds.has(m.id))
    .map((m) => unclassifiedAnalysisResult(m, analysisByMasterId.get(m.id)));

  const tally = tallyDistributions(ownedAnalysisRows);

  return {
    total: masters.length,
    analyzed: tally.analyzed,
    partialCount: tally.partialCount,
    unclassifiedCount: unclassified.length,
    gradeDistribution: tally.gradeDistribution,
    complianceDistribution: tally.complianceDistribution,
    allResults,
    unclassified,
  } satisfies ThumbnailAnalysisListResponse;
}

export type AnalysisSummaryRow = Pick<
  AnalysisRow,
  'grade' | 'complianceGrade' | 'qualityAnalyzedAt' | 'complianceAnalyzedAt'
>;

/**
 * Same tallying as the listing path but driven by the lightweight summary
 * select (no full row hydration). `masterCount` is the company-scoped master
 * total before any analysis filtering — it doubles as the upper bound on
 * `unclassifiedCount`.
 */
export function buildAnalysisSummary(
  masterCount: number,
  rows: ReadonlyArray<AnalysisSummaryRow>,
): ThumbnailAnalysisSummary {
  const tally = tallyDistributions(rows);
  return {
    total: masterCount,
    analyzed: tally.analyzed,
    partialCount: tally.partialCount,
    unclassifiedCount: Math.max(masterCount - tally.analyzed, 0),
    gradeDistribution: tally.gradeDistribution,
    complianceDistribution: tally.complianceDistribution,
  } satisfies ThumbnailAnalysisSummary;
}
