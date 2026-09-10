import { describe, expect, it, vi } from 'vitest';
import { removeRetiredCapabilityOperationRefs } from '../data-migrations/v0.1.31/004_remove_retired_capability_operation_refs';

describe('retired capability operation reference migration', () => {
  it('removes only operationRefs from persisted receipts and preserves the remaining JSON object', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ legacy_receipt_rows: 2n }]);
    const executeRaw = vi.fn().mockResolvedValue(2);

    const result = await removeRetiredCapabilityOperationRefs.run({
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as never);

    expect(result).toEqual({
      affectedRows: 2,
      details: { legacyReceiptRows: 2, removedOperationReferenceRows: 2 },
    });
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(String(executeRaw.mock.calls[0]?.[0]?.raw?.join(' '))).toContain(
      "SET result = result - 'operationRefs'",
    );
  });

  it('does not write when no legacy receipt member remains', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ legacy_receipt_rows: 0 }]);
    const executeRaw = vi.fn();

    const result = await removeRetiredCapabilityOperationRefs.run({
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as never);

    expect(result.affectedRows).toBe(0);
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
