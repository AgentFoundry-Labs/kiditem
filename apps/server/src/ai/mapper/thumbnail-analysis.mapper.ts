import type {
  ComplianceScores,
  ImageSpec,
  ThumbnailAnalysisResult,
  ThumbnailScores,
} from '@kiditem/shared/ai';
import {
  isDisplayableThumbnailUrl,
  resolveMasterThumbnailImage,
  type ThumbnailMasterImageRow,
} from '../services/thumbnail-master-image-resolver';
import type {
  AnalysisRow,
  MasterRow,
} from '../adapter/out/prisma/thumbnail-analysis.query';

export type AnalysisRowMaster = {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: ThumbnailMasterImageRow[];
};

/**
 * Has any branch of the analysis (quality or compliance) actually been run
 * against the master? `preInspect` writes spec-only rows where neither flag is
 * set — those are intentionally excluded from the "analyzed" projection.
 */
export function hasActualAnalysis(a: AnalysisRow): boolean {
  return a.qualityAnalyzedAt !== null || a.complianceAnalyzedAt !== null;
}

/**
 * Project a `thumbnailAnalysis` row + the originating master into the shared
 * `ThumbnailAnalysisResult` shape. The master argument is allowed to be
 * `null` so the same mapper can render a row whose master is no longer
 * findable for the caller's company (in which case `productName` falls back
 * to empty and the image URL falls back to the analysis row's own value).
 */
export function toAnalysisResult(
  a: AnalysisRow,
  master: AnalysisRowMaster | null,
): ThumbnailAnalysisResult {
  const fallback = master ? resolveMasterThumbnailImage(master) : null;
  return {
    id: a.id,
    productId: a.masterId,
    productName: master?.name ?? '',
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
 * Render a master that has no quality analysis yet. `existing` is the
 * spec-only `thumbnailAnalysis` row produced by `preInspect`, if any —
 * carrying its `imageSpec` / `recompose` forward keeps the unclassified
 * tile informative without claiming it's been analyzed.
 */
export function unclassifiedAnalysisResult(
  m: MasterRow,
  existing?: AnalysisRow,
): ThumbnailAnalysisResult {
  return {
    id: m.id,
    productId: m.id,
    productName: m.name,
    imageUrl: resolveMasterThumbnailImage(m),
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
    createdAt: m.createdAt.toISOString(),
  } satisfies ThumbnailAnalysisResult;
}
