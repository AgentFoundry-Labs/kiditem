import type { Prisma, PrismaClient, ThumbnailGeneration } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * ADR-0011 Phase 3 writer helpers. Every helper enforces the invariant:
 *   status = 'succeeded' ⇔ phase ∈ {'ready', 'applied'}
 *   otherwise phase = null
 *
 * State machine (canonical):
 *
 *          markReady(extras?)     markApplied()
 *   pending ─running─────────► succeeded+ready ─────► succeeded+applied
 *      │        │                    │                       │
 *      │        ▼                    ▼                       ▼
 *      │     failed            (user skip)                resetToPending
 *      │                       = cancelled                     │
 *      └◄─────────────────────────────────────────────────────┘
 *
 * Simple terminals (failed/cancelled/running) are written inline with `phase: null`.
 * Helpers support optional `include` to avoid double roundtrip when a caller needs
 * related rows (e.g., include: { product: ... }).
 */

export type ReadyExtras = Partial<Pick<Prisma.ThumbnailGenerationUpdateInput,
  'selectedUrl' | 'candidates' | 'editAnalysis'>>;

export type ResetExtras = Partial<Pick<Prisma.ThumbnailGenerationUpdateInput,
  'candidates' | 'selectedUrl'>>;

type MarkOptions = {
  include?: Prisma.ThumbnailGenerationInclude;
};

export async function markReady<I extends MarkOptions['include']>(
  prisma: Client,
  id: string,
  extras: ReadyExtras = {},
  options?: { include?: I },
) {
  return prisma.thumbnailGeneration.update({
    where: { id },
    data: { status: 'succeeded', phase: 'ready', ...extras },
    ...(options?.include ? { include: options.include } : {}),
  });
}

export async function markApplied<I extends MarkOptions['include']>(
  prisma: Client,
  id: string,
  options?: { include?: I },
) {
  return prisma.thumbnailGeneration.update({
    where: { id },
    data: { status: 'succeeded', phase: 'applied' },
    ...(options?.include ? { include: options.include } : {}),
  });
}

export async function resetToPending(
  prisma: Client,
  id: string,
  extras: ResetExtras = {},
): Promise<ThumbnailGeneration> {
  return prisma.thumbnailGeneration.update({
    where: { id },
    data: { status: 'pending', phase: null, ...extras },
  });
}
