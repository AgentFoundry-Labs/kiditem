// apps/server/src/products/adapter/out/prisma/product-catalog.query.ts
//
// Catalog hydrated read shape used by `GET /api/products/catalog`,
// `GET /api/products/catalog/:id`, and `GET /api/products/catalog/counts`.
// Owns the WHERE builder (organizationId + soft-delete + grade + lifecycleState +
// search OR-clause), the explicit `select` that intentionally excludes
// processedData / draftContent JSON blobs, and the nested option
// tenant scope (`{ organizationId, isDeleted: false, isActive: true }`).
import type { Prisma } from '@prisma/client';
import { PRODUCT_LIFECYCLE_STATES } from '@kiditem/shared/product';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ListProductCatalogQuery } from '../../../dto/list-product-catalog.query';

export type CatalogOptionRow = {
  id: string;
  masterId: string;
  organizationId: string;
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
  organizationId: string;
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
  lifecycleState: string;
  detailPageUrl: string | null;
  thumbnailStrategy: string;
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
  lifecycleState: string;
  isTemporary: boolean;
};

export function buildCatalogWhere(
  organizationId: string,
  q: Pick<ListProductCatalogQuery, 'search' | 'grade' | 'lifecycleState'>,
): Prisma.MasterProductWhereInput {
  const ands: Prisma.MasterProductWhereInput[] = [];
  if (q.search) {
    ands.push({
      OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { code: { contains: q.search } },
        { legacyCode: { contains: q.search } },
        // ADR-0022 — source barcode/EAN. May match multiple masters because
        // (organizationId, barcode) is non-unique by design.
        { barcode: { contains: q.search } },
        { options: { some: { sku: { contains: q.search, mode: 'insensitive' }, isDeleted: false } } },
        // Also match option-level legacy code (판매자 상품코드) so users can find
        // a master from any per-row source code from the workbook.
        { options: { some: { legacyCode: { contains: q.search }, isDeleted: false } } },
      ],
    });
  }
  // Phase 5 (#192): only forward `lifecycleState` if it parses to a known
  // value. Unknown query values short-circuit to no filter so we never echo a
  // bogus enum value into the WHERE clause.
  const lifecycleState =
    q.lifecycleState && (PRODUCT_LIFECYCLE_STATES as readonly string[]).includes(q.lifecycleState)
      ? q.lifecycleState
      : undefined;
  return {
    organizationId,
    isDeleted: false,
    ...(q.grade ? { abcGrade: q.grade } : {}),
    ...(lifecycleState ? { lifecycleState } : {}),
    ...(ands.length > 0 ? { AND: ands } : {}),
  };
}

/**
 * Explicit `select` so we never load `rawData` / `processedData` / `draftContent`
 * JSON blobs for catalog list/detail. Zod strips unknown keys on response but the
 * DB + network cost would still be paid without this. Nested option `where`
 * binds `organizationId` for tenant isolation (defense in depth on top of the master
 * `where`).
 */
export function buildCatalogMasterSelect(organizationId: string) {
  return {
    id: true,
    organizationId: true,
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
    lifecycleState: true,
    detailPageUrl: true,
    thumbnailStrategy: true,
    isDeleted: true,
    deletedAt: true,
    isTemporary: true,
    temporaryReason: true,
    memo: true,
    createdAt: true,
    updatedAt: true,
    options: {
      where: { organizationId, isDeleted: false, isActive: true },
      orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
      include: { inventory: { select: { currentStock: true } } },
    },
  };
}

export async function findCatalogPage(
  prisma: PrismaService,
  organizationId: string,
  q: ListProductCatalogQuery,
): Promise<{ rows: CatalogMasterRow[]; total: number; page: number; limit: number }> {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const where = buildCatalogWhere(organizationId, q);
  const [rows, total] = await Promise.all([
    prisma.masterProduct.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: buildCatalogMasterSelect(organizationId),
    }),
    prisma.masterProduct.count({ where }),
  ]);
  return { rows: rows as unknown as CatalogMasterRow[], total, page, limit };
}

export async function findCatalogDetail(
  prisma: PrismaService,
  organizationId: string,
  id: string,
): Promise<CatalogMasterRow | null> {
  const row = await prisma.masterProduct.findFirst({
    where: { id, organizationId, isDeleted: false },
    select: buildCatalogMasterSelect(organizationId),
  });
  return (row as unknown as CatalogMasterRow | null) ?? null;
}

export async function findCatalogCountsRows(
  prisma: PrismaService,
  organizationId: string,
  q: Pick<ListProductCatalogQuery, 'lifecycleState'> = {},
): Promise<CatalogCountsRow[]> {
  return prisma.masterProduct.findMany({
    where: buildCatalogWhere(organizationId, q),
    select: { abcGrade: true, adTier: true, lifecycleState: true, isTemporary: true },
  });
}
