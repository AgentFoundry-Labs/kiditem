import type { ThumbnailGenerationItem } from '@kiditem/shared';

/**
 * ADR-0011 Phase 3 frontend helpers. Compose canonical (status, phase) into
 * domain-level predicates used by 11 web consumers.
 *
 * Invariants (enforced backend-side by writer helpers + Zod):
 *   status = 'succeeded'  ⇔  phase ∈ {'ready', 'applied'}
 *   status ≠ 'succeeded'  ⇔  phase = null
 */

type StatusPhase = Pick<ThumbnailGenerationItem, 'status'> & {
  phase?: 'ready' | 'applied' | null;
};

export const isReady = (g: StatusPhase): boolean =>
  g.status === 'succeeded' && g.phase === 'ready';

export const isApplied = (g: StatusPhase): boolean =>
  g.status === 'succeeded' && g.phase === 'applied';

export const isActive = (g: StatusPhase): boolean =>
  g.status === 'pending' || g.status === 'running';

export const isCompleted = (g: StatusPhase): boolean =>
  g.status === 'succeeded';
