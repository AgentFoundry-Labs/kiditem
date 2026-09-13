import { describe, expect, it, vi } from 'vitest';
import { removeRetiredCapabilityOperationRefs } from '../data-migrations/v0.1.31/004_remove_retired_capability_operation_refs';

describe('retired capability operation reference migration', () => {
  it('removes only operationRefs from persisted receipts and preserves the remaining JSON object', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ table_exists: true }])
      .mockResolvedValueOnce([{ legacy_receipt_rows: 2n }]);
    const executeRaw = vi.fn().mockResolvedValue(2);

    const result = await removeRetiredCapabilityOperationRefs.run({
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as never);

    expect(result).toEqual({
      affectedRows: 2,
      details: {
        capabilityInvocationTablePresent: true,
        legacyReceiptRows: 2,
        removedOperationReferenceRows: 2,
      },
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(String(executeRaw.mock.calls[0]?.[0]?.raw?.join(' '))).toContain(
      "SET result = result - 'operationRefs'",
    );
  });

  it('does not write when no legacy receipt member remains', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ table_exists: true }])
      .mockResolvedValueOnce([{ legacy_receipt_rows: 0 }]);
    const executeRaw = vi.fn();

    const result = await removeRetiredCapabilityOperationRefs.run({
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as never);

    expect(result.affectedRows).toBe(0);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('is a zero-row no-op when the optional capability receipt table is absent', async () => {
    const queryRaw = vi.fn(async (query: { raw?: readonly string[] }) => {
      const sql = String(query?.raw?.join(' ') ?? '');
      if (!sql.includes("to_regclass('public.capability_invocations')")) {
        throw new Error('absent optional table must not be queried directly');
      }
      return [{ table_exists: false }];
    });
    const executeRaw = vi.fn();

    const result = await removeRetiredCapabilityOperationRefs.run({
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as never);

    expect(result).toEqual({
      affectedRows: 0,
      details: {
        capabilityInvocationTablePresent: false,
        legacyReceiptRows: 0,
        removedOperationReferenceRows: 0,
      },
    });
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
