import type { Prisma } from '@prisma/client';
import type { CreateOptionDto } from '../dto/create-option.dto';
import type { UpdateOptionDto } from '../dto/update-option.dto';

/**
 * System-managed `ProductOption` fields a client cannot set or change via DTO.
 *
 * `masterId` is included → prevents IDOR re-parent via PATCH. `availableStock`
 * is included → enforces ADR-0014 (BundleStockService is the sole writer).
 * `sku` is system-generated inside the SKU lifecycle layer.
 */
export const PRODUCT_OPTION_SYSTEM_FIELDS = [
  'id', 'sku', 'companyId', 'masterId', 'availableStock',
  'isDeleted', 'deletedAt', 'createdAt', 'updatedAt',
] as const;

export type ProductOptionSystemField = typeof PRODUCT_OPTION_SYSTEM_FIELDS[number];

/**
 * Remove `PRODUCT_OPTION_SYSTEM_FIELDS` from a DTO before forwarding to Prisma.
 *
 * Return type preserves the caller's input type minus the stripped keys so the
 * call site does not need a loose `Record<string, unknown>` intermediate cast
 * (apps/server/AGENTS.md DTO boundary). The remaining cast to
 * `Prisma.ProductOptionUnchecked{Create,Update}Input` at the call site is
 * inherent to the DTO ↔ Prisma-input shape gap and unavoidable.
 */
export function stripProductOptionSystemFields<
  T extends Partial<CreateOptionDto> | Partial<UpdateOptionDto>,
>(dto: T): Omit<T, ProductOptionSystemField> {
  const out: Record<string, unknown> = { ...dto };
  for (const f of PRODUCT_OPTION_SYSTEM_FIELDS) delete out[f as string];
  return out as Omit<T, ProductOptionSystemField>;
}

export type BundleFlipDirection =
  | 'no-change'
  | 'enable-to-disable'
  | 'disable-to-enable';

/**
 * Classify an `isBundle` PATCH against the current row.
 *
 * - `no-change` — DTO did not request a flip.
 * - `enable-to-disable` — bundle → non-bundle. Caller must reject if this row
 *   still owns `BundleComponent` rows (would leave orphan components).
 * - `disable-to-enable` — non-bundle → bundle. Caller must reject if this row
 *   is already referenced as a component elsewhere (would create a nested
 *   bundle, banned in Plan B1).
 *
 * The actual relation count check lives in the persistence layer because it
 * must run inside the same transaction as the patch.
 */
export function classifyBundleFlip(
  currentIsBundle: boolean,
  next: boolean | undefined,
): BundleFlipDirection {
  if (next === undefined || next === currentIsBundle) return 'no-change';
  return next === false ? 'enable-to-disable' : 'disable-to-enable';
}

/**
 * Apply the "isTemporary=false clears temporaryReason" rule to a Prisma update
 * payload. Pure transform — no DB access. Mirrors the existing service-level
 * behavior so MASTER and OPTION update paths share identical semantics.
 */
export function applyTemporaryReasonClearing(
  data: Prisma.ProductOptionUncheckedUpdateInput,
  dto: Pick<UpdateOptionDto, 'isTemporary'>,
): Prisma.ProductOptionUncheckedUpdateInput {
  if (dto.isTemporary === false) {
    return { ...data, temporaryReason: null };
  }
  return data;
}
