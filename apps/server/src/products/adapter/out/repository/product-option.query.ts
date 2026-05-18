import { NotFoundException } from '@nestjs/common';
import { Prisma, type ProductOption } from '@prisma/client';
import type { ProductOptionListItem } from '@kiditem/shared/product';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ListOptionsQuery } from '../../../dto/list-options.query';
import { decodeCursor, encodeCursor } from '../../../util/cursor';

/**
 * Tenant-scoped read shapes for `ProductOption`.
 *
 * All reads bind `organizationId` and exclude soft-deleted rows by default. They
 * use `findFirst` (never `findUnique`) so the multi-tenant predicate sits in
 * the SQL window — the `check:tenant-scope` scanner forbids bare-id
 * `findUnique`/`findUniqueOrThrow` calls. `findBySku` and `findByBarcode`
 * stay on `findFirst` deliberately: barcode uniqueness is a partial index
 * (active rows only) and sku is unique table-wide but may belong to another
 * tenant or to a soft-deleted entry.
 */

export interface OptionsListPage {
  items: ProductOptionListItem[];
  nextCursor: string | null;
}

function decimalToNumber(value: Prisma.Decimal | number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' ? value : value.toNumber();
}

/**
 * Cursor-paginated tenant-scoped option list.
 *
 * `search` and `cursor` predicates are wrapped in a top-level `AND` array to
 * avoid OR-collision between them (same fix MastersService uses). search hits
 * `sku`, `legacyCode`, and `optionName` — explicitly NOT `barcode` so the
 * option-management surface and the dedicated barcode lookup stay separate.
 */
export async function listOptions(
  prisma: PrismaService,
  organizationId: string,
  q: ListOptionsQuery,
): Promise<OptionsListPage> {
  const limit = q.limit ?? 50;

  const ands: Prisma.ProductOptionWhereInput[] = [];
  if (q.search) {
    ands.push({
      OR: [
        { sku: { contains: q.search, mode: 'insensitive' } },
        { legacyCode: { contains: q.search } },
        { optionName: { contains: q.search, mode: 'insensitive' } },
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

  const where: Prisma.ProductOptionWhereInput = {
    organizationId,
    ...(q.includeDeleted ? {} : { isDeleted: false }),
    ...(q.masterId ? { masterId: q.masterId } : {}),
    ...(q.isBundle !== undefined ? { isBundle: q.isBundle } : {}),
    ...(q.isDeleted !== undefined ? { isDeleted: q.isDeleted } : {}),
    ...(q.isTemporary !== undefined ? { isTemporary: q.isTemporary } : {}),
    ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
    ...(ands.length > 0 ? { AND: ands } : {}),
  };

  const rows = await prisma.productOption.findMany({
    where,
    include: {
      master: { select: { name: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const items = rows.slice(0, limit).map(({ master, commissionRate, ...row }) => ({
    ...row,
    commissionRate: decimalToNumber(commissionRate),
    masterName: master.name,
  } satisfies ProductOptionListItem));
  const nextCursor = rows.length > limit
    ? encodeCursor({
        createdAt: items[items.length - 1].createdAt.toISOString(),
        id: items[items.length - 1].id,
      })
    : null;
  return { items, nextCursor };
}

export async function findOptionById(
  prisma: PrismaService,
  organizationId: string,
  id: string,
  opts: { includeDeleted?: boolean },
): Promise<ProductOption> {
  const row = await prisma.productOption.findFirst({
    where: {
      id,
      organizationId,
      ...(opts.includeDeleted ? {} : { isDeleted: false }),
    },
  });
  if (!row) throw new NotFoundException('option not found');
  return row;
}

/**
 * sku is unique table-wide, but the row may belong to another tenant or to a
 * soft-deleted entry. `findFirst` keeps cross-tenant rows off the SQL path
 * entirely — no IDOR `findUnique({ sku }) + post-filter` window.
 */
export async function findOptionBySku(
  prisma: PrismaService,
  organizationId: string,
  sku: string,
): Promise<ProductOption> {
  const row = await prisma.productOption.findFirst({
    where: { sku, organizationId, isDeleted: false },
  });
  if (!row) throw new NotFoundException('option not found');
  return row;
}

/**
 * Barcode uniqueness is enforced by partial index
 * (`product_options_organization_barcode_active`) — only active rows are unique.
 * `findFirst` matches the partial-index semantics and excludes soft-deleted
 * rows.
 */
export async function findOptionByBarcode(
  prisma: PrismaService,
  organizationId: string,
  barcode: string,
): Promise<ProductOption> {
  const row = await prisma.productOption.findFirst({
    where: { organizationId, barcode, isDeleted: false },
  });
  if (!row) throw new NotFoundException('option not found');
  return row;
}
