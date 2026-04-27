import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared';
import { isApplied, isReady } from '@/lib/thumbnail-status';
import { needsThumbnailFix } from './thumbnail-classification';

export type PipelineStage =
  | 'unclassified'
  | 'classified'
  | 'needs-fix'
  | 'ai-edit'
  | 'applied';

export function getStage(
  product: ThumbnailAnalysisResult,
  latestGen: ThumbnailGenerationItem | undefined,
): PipelineStage {
  if (latestGen) {
    if (isApplied(latestGen)) return 'applied';
    if (latestGen.status === 'pending' || latestGen.status === 'running' || isReady(latestGen)) {
      return 'ai-edit';
    }
    // failed / skipped → fall through to analysis state
  }
  if (!product.analyzed) return 'unclassified';
  return needsThumbnailFix(product) ? 'needs-fix' : 'classified';
}

const ORDER: PipelineStage[] = ['unclassified', 'classified', 'needs-fix', 'ai-edit', 'applied'];

export function canAdvance(from: PipelineStage, to: PipelineStage): boolean {
  return ORDER.indexOf(to) >= ORDER.indexOf(from);
}
