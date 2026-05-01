import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { thumbnailMasterImageSelect } from './master-image-select.preset';
import type { GenerationMasterSummary, GenerationRow } from '../../../mapper/thumbnail-generation.mapper';

/**
 * Tenant-scoped read shapes for `ThumbnailGeneration` and the `MasterProduct`
 * context required to schedule edit jobs. All Prisma access binds `organizationId`
 * on every query (and on every related include) so a generation cannot be
 * fetched, listed, or hydrated across tenants.
 *
 * Function modules — not Nest providers — to keep `ai.module.ts` unchanged.
 */

export const THUMBNAIL_ANALYSIS_SELECT = {
  recompose: true,
  complianceGrade: true,
  complianceScores: true,
  overallScore: true,
  grade: true,
  qualityAnalyzedAt: true,
  complianceAnalyzedAt: true,
} satisfies Prisma.ThumbnailAnalysisSelect;

/**
 * Tenant-scoped include preset for the relations rendered into a
 * `ThumbnailGenerationItem`. Both `candidates` and `registrationAttempts` are
 * filtered by `organizationId` even though the parent row already is — the relation
 * filter is the second tenant predicate that prevents stale cross-tenant rows
 * from leaking through include hydration.
 */
export function generationInclude(organizationId: string): Prisma.ThumbnailGenerationInclude {
  return {
    candidates: {
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    },
    registrationAttempts: {
      where: { organizationId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 1,
    },
  };
}

export function inputImagesInclude(
  organizationId: string,
): Prisma.ThumbnailGeneration$inputImagesArgs {
  return {
    where: { organizationId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  };
}

export function candidatesInclude(
  organizationId: string,
): Prisma.ThumbnailGeneration$candidatesArgs {
  return {
    where: { organizationId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  };
}

export function thumbnailAnalysesInclude(
  organizationId: string,
): Prisma.MasterProduct$thumbnailAnalysesArgs {
  return {
    where: { organizationId },
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: THUMBNAIL_ANALYSIS_SELECT,
  };
}

/**
 * Master select preset used when scheduling an edit job. Includes the
 * tenant-scoped image preset so the master image resolver can run, plus the
 * latest `ThumbnailAnalysis` row to drive prompt routing.
 */
export function jobMasterSelect(organizationId: string) {
  return {
    id: true,
    name: true,
    imageUrl: true,
    thumbnailUrl: true,
    category: true,
    images: thumbnailMasterImageSelect(organizationId),
    thumbnailAnalyses: thumbnailAnalysesInclude(organizationId),
  } satisfies Prisma.MasterProductSelect;
}

export type JobMasterRow = Prisma.MasterProductGetPayload<{ select: ReturnType<typeof jobMasterSelect> }>;

export type EditorProductRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
  organizationId: string;
};

export async function findProductForEditor(
  prisma: PrismaService,
  productId: string,
  organizationId: string,
): Promise<EditorProductRow | null> {
  return prisma.masterProduct.findFirst({
    where: { id: productId, organizationId, isDeleted: false },
    select: { id: true, name: true, imageUrl: true, category: true, organizationId: true },
  });
}

/**
 * Master summary lookup for `findAll` / `findOne`. Rendered product data is
 * always derived from this scoped lookup, never from the row's relation
 * include, so a stale cross-tenant `MasterProduct` join can never reach the
 * API.
 */
export async function findGenerationMasters(
  prisma: PrismaService,
  rows: Array<{ masterId: string }>,
  organizationId: string,
): Promise<Map<string, GenerationMasterSummary>> {
  const ids = [...new Set(rows.map((row) => row.masterId).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const masters = await prisma.masterProduct.findMany({
    where: { id: { in: ids }, organizationId, isDeleted: false },
    select: { id: true, name: true, imageUrl: true, category: true },
  });
  return new Map(masters.map((master) => [master.id, master]));
}

export async function findGenerationMaster(
  prisma: PrismaService,
  masterId: string,
  organizationId: string,
): Promise<GenerationMasterSummary | null> {
  const masters = await findGenerationMasters(prisma, [{ masterId }], organizationId);
  return masters.get(masterId) ?? null;
}

export async function findJobMaster(
  prisma: PrismaService,
  masterId: string,
  organizationId: string,
): Promise<JobMasterRow | null> {
  return prisma.masterProduct.findFirst({
    where: { id: masterId, organizationId, isDeleted: false },
    select: jobMasterSelect(organizationId),
  });
}

export async function findJobMastersByIds(
  prisma: PrismaService,
  ids: string[],
  organizationId: string,
): Promise<Map<string, JobMasterRow>> {
  if (ids.length === 0) return new Map();
  const products = await prisma.masterProduct.findMany({
    where: { id: { in: ids }, organizationId, isDeleted: false },
    select: jobMasterSelect(organizationId),
  });
  return new Map(products.map((p) => [p.id, p]));
}

export async function findGenerationRows(
  prisma: PrismaService,
  organizationId: string,
  opts: { productId?: string | null; limit?: number | null } = {},
): Promise<GenerationRow[]> {
  const limit = opts.limit ? Math.min(Math.max(opts.limit, 1), 100) : undefined;
  const rows = await prisma.thumbnailGeneration.findMany({
    where: {
      organizationId,
      ...(opts.productId ? { masterId: opts.productId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
    include: generationInclude(organizationId),
  });
  return rows as unknown as GenerationRow[];
}

export async function findGenerationOrThrow(
  prisma: PrismaService,
  id: string,
  organizationId: string,
): Promise<GenerationRow> {
  const row = await prisma.thumbnailGeneration.findFirst({
    where: { id, organizationId },
    include: generationInclude(organizationId),
  });
  if (!row) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  return row as unknown as GenerationRow;
}

export async function findGenerationWithCandidatesOrThrow(
  prisma: PrismaService,
  id: string,
  organizationId: string,
) {
  const row = await prisma.thumbnailGeneration.findFirst({
    where: { id, organizationId },
    include: { candidates: candidatesInclude(organizationId) },
  });
  if (!row) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  return row;
}

export async function findGenerationWithInputImages(
  prisma: PrismaService,
  id: string,
  organizationId: string,
) {
  return prisma.thumbnailGeneration.findFirst({
    where: { id, organizationId },
    include: {
      inputImages: inputImagesInclude(organizationId),
    },
  });
}

export async function findActiveJobForProduct(
  prisma: PrismaService,
  masterId: string,
  organizationId: string,
  method: string,
): Promise<GenerationRow | null> {
  const row = await prisma.thumbnailGeneration.findFirst({
    where: {
      masterId,
      organizationId,
      method,
      status: { in: ['pending', 'running'] },
    },
    include: generationInclude(organizationId),
  });
  return (row as unknown as GenerationRow | null) ?? null;
}

export async function findRecentAutoJob(
  prisma: PrismaService,
  masterId: string,
  organizationId: string,
  cooldownStart: Date,
): Promise<{ id: string } | null> {
  return prisma.thumbnailGeneration.findFirst({
    where: {
      organizationId,
      masterId,
      method: 'auto',
      createdAt: { gte: cooldownStart },
    },
    select: { id: true },
  });
}

export async function findAutoBatchCandidates(
  prisma: PrismaService,
  organizationId: string,
  take: number,
): Promise<Array<{ id: string }>> {
  return prisma.masterProduct.findMany({
    where: {
      organizationId,
      abcGrade: 'A',
      isDeleted: false,
      OR: [{ imageUrl: { not: null } }, { thumbnailUrl: { not: null } }],
    },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
    take,
  });
}

export async function findThumbnailAnalysisGrade(
  prisma: PrismaService,
  masterId: string,
  organizationId: string,
): Promise<{ grade: string; overallScore: number } | null> {
  return prisma.thumbnailAnalysis.findFirst({
    where: { masterId, organizationId },
    select: { grade: true, overallScore: true },
  });
}
