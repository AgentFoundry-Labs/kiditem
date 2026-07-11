import {
  ConflictException, NotFoundException,
} from '@nestjs/common';
import { Prisma, type ProductOption } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { mapPrismaError } from '../../../util/prisma-error';

/**
 * Tenant-scoped Prisma writers + intra-transaction reads for `ProductOption`.
 *
 * Every helper takes a Prisma client (`Prisma.TransactionClient` or
 * `PrismaService`) as the first argument and binds `organizationId` on the actual
 * write/read predicate. The OptionsService keeps `$transaction` ownership;
 * these helpers are deliberately not aware of when to open one.
 *
 * No bare-id `findUnique` / `update` / `delete` is used — `check:tenant-scope`
 * baseline stays at zero. Multi-step write invariants (counter increment +
 * post-increment reread, soft-delete fan-out lookup, count-checked patches)
 * stay one helper each so the call site cannot accidentally split them.
 */

export type OptionTxClient = Prisma.TransactionClient | PrismaService;

/**
 * Atomically increment `MasterProduct.optionCounter` for `(masterId, organizationId,
 * isDeleted: false)` and re-read the post-increment `{code, optionCounter}`.
 *
 * Combines the TOCTOU guard (filter on `isDeleted: false`) with the counter
 * increment in a single `updateMany` row lock. The reread uses tenant-scoped
 * `findFirst` so cross-tenant rows never enter the SQL path.
 *
 * Must run inside the caller's transaction — the SKU is composed from the
 * post-increment value, then `createOptionWithSku` writes the row inside the
 * same `tx`.
 */
export async function incrementMasterOptionCounter(
  tx: Prisma.TransactionClient,
  organizationId: string,
  masterId: string,
): Promise<{ code: string; optionCounter: number }> {
  const { count } = await tx.masterProduct.updateMany({
    where: { id: masterId, organizationId, isDeleted: false },
    data: { optionCounter: { increment: 1 } },
  });
  if (count === 0) throw new NotFoundException('master not found or deleted');
  const master = await tx.masterProduct.findFirst({
    where: { id: masterId, organizationId, isDeleted: false },
    select: { code: true, optionCounter: true },
  });
  if (!master) throw new NotFoundException('master not found or deleted');
  return master;
}

/**
 * Persist a new `ProductOption` row with the system-managed fields hard-pinned
 * regardless of caller payload:
 *   - `organizationId` from `@CurrentOrganization()` (never DTO).
 *   - `masterId` from the validated DTO that was used to increment the
 *     counter (never re-derived from the create payload).
 *   - `sku` from `buildOptionSku(...)` over the post-increment counter.
 *
 * `data` is the DTO already passed through `stripProductOptionSystemFields`.
 */
export async function createOptionWithSku(
  tx: Prisma.TransactionClient,
  organizationId: string,
  masterId: string,
  sku: string,
  data: Record<string, unknown>,
): Promise<ProductOption> {
  try {
    return await tx.productOption.create({
      data: {
        ...data,
        organizationId,
        masterId,
        sku,
      } as Prisma.ProductOptionUncheckedCreateInput,
    });
  } catch (e) { mapPrismaError(e, 'option create'); }
}

/**
 * Tenant-scoped read of the current option row inside a transaction. Used as
 * the prelude to the bundle-flip checks + patch so the bundle relation count
 * and the patch all observe the same `current.isBundle` value.
 */
export async function findCurrentOption(
  tx: Prisma.TransactionClient,
  organizationId: string,
  id: string,
): Promise<ProductOption> {
  const row = await tx.productOption.findFirst({
    where: { id, organizationId, isDeleted: false },
  });
  if (!row) throw new NotFoundException('option not found');
  return row;
}

/**
 * Reject `isBundle=true → false` flips when the option still owns
 * `BundleComponent` rows. Both predicates carry `organizationId` so a stale
 * cross-tenant row cannot block the patch.
 */
export async function assertNoBundleComponents(
  tx: Prisma.TransactionClient,
  organizationId: string,
  bundleOptionId: string,
): Promise<void> {
  const count = await tx.bundleComponent.count({
    where: { bundleOptionId, organizationId },
  });
  if (count > 0) {
    throw new ConflictException('bundle has components; cannot set isBundle=false');
  }
}

/**
 * Reject `isBundle=false → true` flips when the option is already used as a
 * component elsewhere (would create a nested bundle, banned in Plan B1).
 */
export async function assertNotUsedAsComponent(
  tx: Prisma.TransactionClient,
  organizationId: string,
  componentOptionId: string,
): Promise<void> {
  const count = await tx.bundleComponent.count({
    where: { componentOptionId, organizationId },
  });
  if (count > 0) {
    throw new ConflictException('option is used as component; cannot set isBundle=true');
  }
}

/**
 * Tenant-scoped option patch. `updateMany({ id, organizationId, isDeleted: false })`
 * keeps the bare-id write off the SQL path entirely; the count guard catches
 * "row exists in another tenant or is already soft-deleted" without reading
 * the row first.
 */
export async function applyOptionPatch(
  tx: Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: Prisma.ProductOptionUncheckedUpdateInput,
): Promise<ProductOption> {
  try {
    const { count } = await tx.productOption.updateMany({
      where: { id, organizationId, isDeleted: false },
      data,
    });
    if (count === 0) throw new NotFoundException('option not found');
    const updated = await tx.productOption.findFirst({
      where: { id, organizationId, isDeleted: false },
    });
    if (!updated) throw new NotFoundException('option not found');
    return updated;
  } catch (e) { mapPrismaError(e, 'option update'); }
}

/**
 * Tenant-scoped soft-delete write. Uses `updateMany` so the bare-id update
 * never touches `product_options` — `check:tenant-scope` baseline stays at
 * zero. Caller is responsible for fan-out recompute on dependent bundles.
 */
export async function softDeleteOptionRow(
  tx: Prisma.TransactionClient,
  organizationId: string,
  id: string,
): Promise<void> {
  const { count } = await tx.productOption.updateMany({
    where: { id, organizationId, isDeleted: false },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  if (count === 0) throw new NotFoundException('option not found');
}

/**
 * Atomic restore for a soft-deleted option — single tenant-scoped
 * `updateMany` removes the read-then-write window and keeps the bare-id write
 * off the SQL path entirely. P2002 (e.g. partial unique re-collision on
 * restore) still propagates through `mapPrismaError`.
 */
export async function restoreOptionRow(
  db: OptionTxClient,
  organizationId: string,
  id: string,
): Promise<void> {
  try {
    const { count } = await db.productOption.updateMany({
      where: { id, organizationId, isDeleted: true },
      data: { isDeleted: false, deletedAt: null },
    });
    if (count === 0) throw new NotFoundException('option not found or not deleted');
  } catch (e) { mapPrismaError(e, 'option restore'); }
}
