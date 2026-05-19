// apps/server/src/products/adapter/out/repository/master-product.query.ts
//
// MasterProduct hydrated read shape — owns the canonical `include` for the
// nested image rows, the row type the mapper consumes, and tenant-scoped
// list/find queries. `organizationId` is bound on every read; soft-delete is
// applied unless an explicit `includeDeleted` opt opens it for restore /
// audit paths.
import type { MasterProduct, MasterProductImage, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ListMastersQuery } from '../../../dto/list-masters.query';
import { decodeCursor, encodeCursor } from '../../../util/cursor';

export const MASTER_WITH_IMAGES: Prisma.MasterProductInclude = {
  images: {
    where: { isDeleted: false },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
};

export type MasterWithImageRows = MasterProduct & { images: MasterProductImage[] };

export async function findMasterById(
  prisma: PrismaService,
  organizationId: string,
  id: string,
  opts: { includeDeleted?: boolean },
): Promise<MasterWithImageRows | null> {
  return prisma.masterProduct.findFirst({
    where: {
      id, organizationId,
      ...(opts.includeDeleted ? {} : { isDeleted: false }),
    },
    include: MASTER_WITH_IMAGES,
  }) as Promise<MasterWithImageRows | null>;
}

export async function findMasterByCode(
  prisma: PrismaService,
  organizationId: string,
  code: string,
): Promise<MasterWithImageRows | null> {
  return prisma.masterProduct.findFirst({
    where: { code, organizationId, isDeleted: false },
    include: MASTER_WITH_IMAGES,
  }) as Promise<MasterWithImageRows | null>;
}

export async function findMasterByLegacy(
  prisma: PrismaService,
  organizationId: string,
  legacyCode: string,
): Promise<MasterWithImageRows | null> {
  return prisma.masterProduct.findFirst({
    where: { organizationId, legacyCode, isDeleted: false },
    include: MASTER_WITH_IMAGES,
  }) as Promise<MasterWithImageRows | null>;
}

export async function findMasterImageRows(
  prisma: PrismaService,
  organizationId: string,
  masterId: string,
): Promise<MasterProductImage[]> {
  return prisma.masterProductImage.findMany({
    where: { organizationId, masterId, isDeleted: false },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * Cursor-paginated master list. Owns the search OR-clause (name / legacyCode /
 * code / barcode — non-unique source barcode), the filter clauses
 * (category / brand / abcGrade / lifecycleState / isDeleted / isTemporary), the
 * `(createdAt DESC, id DESC)` tuple cursor, and the `take: limit + 1`
 * overshoot used to compute `nextCursor` without a second roundtrip.
 */
export async function findMasterListPage(
  prisma: PrismaService,
  organizationId: string,
  q: ListMastersQuery,
): Promise<{ items: MasterWithImageRows[]; nextCursor: string | null }> {
  const limit = q.limit ?? 50;

  const ands: Prisma.MasterProductWhereInput[] = [];
  if (q.search) {
    ands.push({
      OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { legacyCode: { contains: q.search } },
        { code: { contains: q.search } },
        // Search by source barcode/EAN. May return multiple masters
        // because (organizationId, barcode) is non-unique by design.
        { barcode: { contains: q.search } },
      ],
    });
  }
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    ands.push({
      OR: [
        { createdAt: { lt: new Date(c.createdAt) } },
        { createdAt: new Date(c.createdAt), id: { lt: c.id } },
      ],
    });
  }

  const where: Prisma.MasterProductWhereInput = {
    organizationId,
    ...(q.includeDeleted ? {} : { isDeleted: false }),
    ...(q.isDeleted !== undefined ? { isDeleted: q.isDeleted } : {}),
    ...(q.isTemporary !== undefined ? { isTemporary: q.isTemporary } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.brand ? { brand: q.brand } : {}),
    ...(q.abcGrade ? { abcGrade: q.abcGrade } : {}),
    ...(q.lifecycleState ? { lifecycleState: q.lifecycleState } : {}),
    ...(ands.length > 0 ? { AND: ands } : {}),
  };

  const rows = await prisma.masterProduct.findMany({
    where,
    include: MASTER_WITH_IMAGES,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  }) as MasterWithImageRows[];

  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = rows.length > limit && last
    ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
    : null;
  return { items, nextCursor };
}
