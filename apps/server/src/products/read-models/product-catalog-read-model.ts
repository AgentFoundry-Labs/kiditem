// apps/server/src/products/read-models/product-catalog-read-model.ts
//
// Catalog hydrated read shape used by `GET /api/products/catalog`,
// `GET /api/products/catalog/:id`, and `GET /api/products/catalog/counts`.
// Owns the WHERE builder (companyId + soft-delete + grade + pipelineStep +
// search OR-clause), the explicit `select` that intentionally excludes
// rawData / processedData / draftContent JSON blobs, and the nested option
// tenant scope (`{ companyId, isDeleted: false, isActive: true }`).
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ListProductCatalogQuery } from '../dto/list-product-catalog.query';

export type CatalogOptionRow = {
  id: string;
  masterId: string;
  companyId: string;
  sku: string;
  barcode: string | null;
  legacyCode: string | null;
  optionName: string | null;
  sortOrder: number;
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: Prisma.Decimal | number | null;
  shippingCost: number | null;
  otherCost: number | null;
  isBundle: boolean;
  availableStock: number | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  isTemporary: boolean;
  temporaryReason: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  inventory?: { currentStock: number } | null;
};

export type CatalogMasterRow = {
  id: string;
  companyId: string;
  code: string;
  legacyCode: string | null;
  barcode: string | null;
  name: string;
  description: string;
  category: string | null;
  brand: string | null;
  tags: unknown;
  optionCounter: number;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  images: unknown;
  abcGrade: string | null;
  profitTag: string | null;
  adTier: string | null;
  adBudgetLimit: number | null;
  healthScore: number | null;
  healthUpdatedAt: Date | null;
  sourceUrl: string | null;
  sourcePlatform: string | null;
  costCny: Prisma.Decimal | number | null;
  marginRate: Prisma.Decimal | number | null;
  pipelineStep: string | null;
  detailPageUrl: string | null;
  thumbnailStrategy: string;
  supplierId: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  isTemporary: boolean;
  temporaryReason: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
  options: CatalogOptionRow[];
};

export type CatalogCountsRow = {
  abcGrade: string | null;
  adTier: string | null;
  pipelineStep: string | null;
  isTemporary: boolean;
};

/**
 * Legacy callers pass `status=active` etc. through the deprecated /api/products
 * alias. Only forward values that match a real pipeline step; unknown and 'all'
 * become no filter so we don't return empty lists for meaningless pipelineStep.
 */
export function normalizePipelineStep(value: string | undefined | null): string | null {
  if (!value || value === 'all') return null;
  const KNOWN = new Set(['draft', 'processing', 'processed', 'discontinued']);
  return KNOWN.has(value) ? value : null;
}

export function buildCatalogWhere(
  companyId: string,
  q: Pick<ListProductCatalogQuery, 'search' | 'grade' | 'pipelineStep' | 'status'>,
): Prisma.MasterProductWhereInput {
  const ands: Prisma.MasterProductWhereInput[] = [];
  if (q.search) {
    ands.push({
      OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { code: { contains: q.search } },
        { legacyCode: { contains: q.search } },
        // ADR-0022 — source barcode/EAN. May match multiple masters because
        // (companyId, barcode) is non-unique by design.
        { barcode: { contains: q.search } },
        { options: { some: { sku: { contains: q.search, mode: 'insensitive' }, isDeleted: false } } },
        // Also match option-level legacy code (판매자 상품코드) so users can find
        // a master from any per-row source code from the workbook.
        { options: { some: { legacyCode: { contains: q.search }, isDeleted: false } } },
      ],
    });
  }
  const pipelineStep = normalizePipelineStep(q.pipelineStep ?? q.status);
  return {
    companyId,
    isDeleted: false,
    ...(q.grade ? { abcGrade: q.grade } : {}),
    ...(pipelineStep ? { pipelineStep } : {}),
    ...(ands.length > 0 ? { AND: ands } : {}),
  };
}

/**
 * Explicit `select` so we never load `rawData` / `processedData` / `draftContent`
 * JSON blobs for catalog list/detail. Zod strips unknown keys on response but the
 * DB + network cost would still be paid without this. Nested option `where`
 * binds `companyId` for tenant isolation (defense in depth on top of the master
 * `where`).
 */
export function buildCatalogMasterSelect(companyId: string) {
  return {
    id: true,
    companyId: true,
    code: true,
    legacyCode: true,
    barcode: true,
    name: true,
    description: true,
    category: true,
    brand: true,
    tags: true,
    optionCounter: true,
    thumbnailUrl: true,
    imageUrl: true,
    images: true,
    abcGrade: true,
    profitTag: true,
    adTier: true,
    adBudgetLimit: true,
    healthScore: true,
    healthUpdatedAt: true,
    sourceUrl: true,
    sourcePlatform: true,
    costCny: true,
    marginRate: true,
    pipelineStep: true,
    detailPageUrl: true,
    thumbnailStrategy: true,
    supplierId: true,
    isDeleted: true,
    deletedAt: true,
    isTemporary: true,
    temporaryReason: true,
    memo: true,
    createdAt: true,
    updatedAt: true,
    options: {
      where: { companyId, isDeleted: false, isActive: true },
      orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
      include: { inventory: { select: { currentStock: true } } },
    },
  };
}

export async function findCatalogPage(
  prisma: PrismaService,
  companyId: string,
  q: ListProductCatalogQuery,
): Promise<{ rows: CatalogMasterRow[]; total: number; page: number; limit: number }> {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const where = buildCatalogWhere(companyId, q);
  const [rows, total] = await Promise.all([
    prisma.masterProduct.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: buildCatalogMasterSelect(companyId),
    }),
    prisma.masterProduct.count({ where }),
  ]);
  return { rows: rows as unknown as CatalogMasterRow[], total, page, limit };
}

export async function findCatalogDetail(
  prisma: PrismaService,
  companyId: string,
  id: string,
): Promise<CatalogMasterRow | null> {
  const row = await prisma.masterProduct.findFirst({
    where: { id, companyId, isDeleted: false },
    select: buildCatalogMasterSelect(companyId),
  });
  return (row as unknown as CatalogMasterRow | null) ?? null;
}

export async function findCatalogCountsRows(
  prisma: PrismaService,
  companyId: string,
  q: Pick<ListProductCatalogQuery, 'status' | 'pipelineStep'> = {},
): Promise<CatalogCountsRow[]> {
  return prisma.masterProduct.findMany({
    where: buildCatalogWhere(companyId, q),
    select: { abcGrade: true, adTier: true, pipelineStep: true, isTemporary: true },
  });
}
