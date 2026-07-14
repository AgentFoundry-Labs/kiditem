import type {
  ComplianceScores,
  ImageSpec,
  ThumbnailAnalysisListResponse,
  ThumbnailAnalysisResult,
  ThumbnailAnalysisSummary,
  ThumbnailScores,
} from '@kiditem/shared/ai';
import { isDisplayableThumbnailUrl } from '../domain/thumbnail-workspace-source';
import type {
  ThumbnailAnalysisRow,
  ThumbnailAnalysisSummaryRow,
  ThumbnailAnalysisWorkspaceRow,
} from '../application/port/out/repository/thumbnail-analysis.repository.port';

const EMPTY_GRADE_DIST = { S: 0, A: 0, B: 0, C: 0, F: 0 } as const;
const EMPTY_COMPLIANCE_DIST = { PASS: 0, WARN: 0, FAIL: 0 } as const;

export type AnalysisRowWorkspace = ThumbnailAnalysisWorkspaceRow;

/**
 * Has any branch of the analysis (quality or compliance) actually been run
 * against the workspace? `preInspect` writes spec-only rows where neither flag is
 * set — those are intentionally excluded from the "analyzed" projection.
 */
export function hasActualAnalysis(a: ThumbnailAnalysisRow): boolean {
  return a.qualityAnalyzedAt !== null || a.complianceAnalyzedAt !== null;
}

/**
 * Project a `thumbnailAnalysis` row + the originating workspace into the shared
 * `ThumbnailAnalysisResult` shape. The workspace argument is allowed to be
 * `null` so the same mapper can render a row whose workspace is no longer
 * findable for the caller's organization (in which case `productName` falls back
 * to empty and the image URL falls back to the analysis row's own value).
 */
export function toAnalysisResult(
  a: ThumbnailAnalysisRow,
  workspace: AnalysisRowWorkspace | null,
): ThumbnailAnalysisResult {
  const fallback = workspace?.imageUrl ?? null;
  return {
    id: a.id,
    contentWorkspaceId: a.contentWorkspaceId,
    productName: workspace?.name ?? '',
    imageUrl: isDisplayableThumbnailUrl(a.imageUrl) ? a.imageUrl : fallback,
    overallScore: a.overallScore,
    grade: a.grade,
    scores: (a.scores as ThumbnailScores | null) ?? null,
    issues: (a.issues as ThumbnailAnalysisResult['issues']) ?? [],
    suggestions: (a.suggestions as string[]) ?? [],
    method: a.method ?? 'ai',
    analyzed: !!a.qualityAnalyzedAt,
    qualityAnalyzed: !!a.qualityAnalyzedAt,
    complianceAnalyzed: !!a.complianceAnalyzedAt,
    complianceGrade: a.complianceGrade ?? null,
    complianceScores: (a.complianceScores as ComplianceScores | null) ?? null,
    imageSpec: (a.imageSpec as ImageSpec | null) ?? null,
    recompose: (a.recompose as ThumbnailAnalysisResult['recompose']) ?? null,
    createdAt: a.createdAt.toISOString(),
  } satisfies ThumbnailAnalysisResult;
}

/**
 * Render a workspace that has no quality analysis yet. `existing` is the
 * spec-only `thumbnailAnalysis` row produced by `preInspect`, if any —
 * carrying its `imageSpec` / `recompose` forward keeps the unclassified
 * tile informative without claiming it's been analyzed.
 */
export function unclassifiedAnalysisResult(
  workspace: ThumbnailAnalysisWorkspaceRow,
  existing?: ThumbnailAnalysisRow,
): ThumbnailAnalysisResult {
  return {
    id: workspace.id,
    contentWorkspaceId: workspace.id,
    productName: workspace.name,
    imageUrl: workspace.imageUrl,
    overallScore: 0,
    grade: 'F',
    scores: null,
    issues: [],
    suggestions: [],
    method: 'pending',
    analyzed: false,
    qualityAnalyzed: false,
    complianceAnalyzed: false,
    complianceGrade: null,
    complianceScores: null,
    imageSpec: (existing?.imageSpec as ImageSpec | null) ?? null,
    recompose: (existing?.recompose as ThumbnailAnalysisResult['recompose']) ?? null,
    createdAt: workspace.createdAt.toISOString(),
  } satisfies ThumbnailAnalysisResult;
}

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
    Pick<ThumbnailAnalysisRow, 'grade' | 'complianceGrade' | 'qualityAnalyzedAt' | 'complianceAnalyzedAt'>
  >,
): DistributionTally {
  const gradeDistribution: GradeDistribution = { ...EMPTY_GRADE_DIST };
  const complianceDistribution: ComplianceDistribution = {
    ...EMPTY_COMPLIANCE_DIST,
  };
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

export function buildAnalysisListResponse(
  workspaces: ReadonlyArray<ThumbnailAnalysisWorkspaceRow>,
  analyses: ReadonlyArray<ThumbnailAnalysisRow>,
): ThumbnailAnalysisListResponse {
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const ownedAnalysisRows = analyses.filter((analysis) => workspaceById.has(analysis.contentWorkspaceId));
  const analysisByWorkspaceId = new Map(ownedAnalysisRows.map((analysis) => [analysis.contentWorkspaceId, analysis]));
  const qualityAnalyzedWorkspaceIds = new Set(
    ownedAnalysisRows
      .filter((analysis) => analysis.qualityAnalyzedAt !== null)
      .map((analysis) => analysis.contentWorkspaceId),
  );

  const allResults = ownedAnalysisRows
    .filter(hasActualAnalysis)
    .map((analysis) => toAnalysisResult(analysis, workspaceById.get(analysis.contentWorkspaceId) ?? null));

  const unclassified = workspaces
    .filter((workspace) => !qualityAnalyzedWorkspaceIds.has(workspace.id))
    .map((workspace) => unclassifiedAnalysisResult(workspace, analysisByWorkspaceId.get(workspace.id)));

  const tally = tallyDistributions(ownedAnalysisRows);

  return {
    total: workspaces.length,
    analyzed: tally.analyzed,
    partialCount: tally.partialCount,
    unclassifiedCount: unclassified.length,
    gradeDistribution: tally.gradeDistribution,
    complianceDistribution: tally.complianceDistribution,
    allResults,
    unclassified,
  } satisfies ThumbnailAnalysisListResponse;
}

export function buildAnalysisSummary(
  workspaceCount: number,
  rows: ReadonlyArray<ThumbnailAnalysisSummaryRow>,
): ThumbnailAnalysisSummary {
  const tally = tallyDistributions(rows);
  return {
    total: workspaceCount,
    analyzed: tally.analyzed,
    partialCount: tally.partialCount,
    unclassifiedCount: Math.max(workspaceCount - tally.analyzed, 0),
    gradeDistribution: tally.gradeDistribution,
    complianceDistribution: tally.complianceDistribution,
  } satisfies ThumbnailAnalysisSummary;
}
