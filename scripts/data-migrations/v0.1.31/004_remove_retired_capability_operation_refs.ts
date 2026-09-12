import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

type CountRow = { legacy_receipt_rows: bigint | number | string };

/**
 * Remove the retired operation reference member before the strict receipt
 * schema is deployed. The remaining receipt fields stay intact in JSONB.
 */
export const removeRetiredCapabilityOperationRefs: DataMigration = {
  id: 'v0.1.31:004_remove_retired_capability_operation_refs',
  releaseVersion: '0.1.31',
  name: 'Remove retired operation references from capability receipts',
  phase: 'pre-schema',
  async run(tx: Prisma.TransactionClient): Promise<MigrationResult> {
    const [table] = await tx.$queryRaw<Array<{ table_exists: boolean }>>`
      SELECT to_regclass('public.capability_invocations') IS NOT NULL AS table_exists
    `;
    const capabilityInvocationTablePresent = table?.table_exists === true;
    if (!capabilityInvocationTablePresent) {
      return {
        affectedRows: 0,
        details: {
          capabilityInvocationTablePresent,
          legacyReceiptRows: 0,
          removedOperationReferenceRows: 0,
        },
      };
    }

    const [before] = await tx.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS legacy_receipt_rows
      FROM capability_invocations
      WHERE result IS NOT NULL
        AND jsonb_typeof(result) = 'object'
        AND result ? 'operationRefs'
    `;
    const legacyReceiptRows = toCount(before?.legacy_receipt_rows);
    if (legacyReceiptRows === 0) {
      return {
        affectedRows: 0,
        details: {
          capabilityInvocationTablePresent,
          legacyReceiptRows: 0,
          removedOperationReferenceRows: 0,
        },
      };
    }

    const removedOperationReferenceRows = await tx.$executeRaw`
      UPDATE capability_invocations
      SET result = result - 'operationRefs'
      WHERE result IS NOT NULL
        AND jsonb_typeof(result) = 'object'
        AND result ? 'operationRefs'
    `;
    if (removedOperationReferenceRows !== legacyReceiptRows) {
      throw new Error('Capability receipt cleanup changed an unexpected number of rows.');
    }

    return {
      affectedRows: removedOperationReferenceRows,
      details: {
        capabilityInvocationTablePresent,
        legacyReceiptRows,
        removedOperationReferenceRows,
      },
    };
  },
};

function toCount(value: CountRow['legacy_receipt_rows'] | undefined): number {
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Capability receipt cleanup returned an invalid row count.');
  }
  return count;
}
