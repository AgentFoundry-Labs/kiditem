import { describe, expect, it, vi } from 'vitest';
import { persistAndVerifyCoupangShipmentDateSummary } from './coupang-shipment-date-summary';

describe('persistAndVerifyCoupangShipmentDateSummary', () => {
  it('reloads the server summary after saving and returns the verified full set', async () => {
    const calls: string[] = [];
    const save = vi.fn(async () => {
      calls.push('save');
    });
    const load = vi.fn(async () => {
      calls.push('load');
      return {
        items: [
          { date: '2026-07-25', count: 3, boxes: 5, capturedAt: '2026-07-25T00:00:00.000Z' },
          { date: '2026-07-24', count: 2, boxes: 2, capturedAt: '2026-07-24T00:00:00.000Z' },
        ],
      };
    });

    const result = await persistAndVerifyCoupangShipmentDateSummary(
      [{ date: '2026-07-25', count: 3, boxes: 5 }],
      { save, load },
    );

    expect(calls).toEqual(['save', 'load']);
    expect(save).toHaveBeenCalledWith([{ date: '2026-07-25', count: 3, boxes: 5 }]);
    expect(result).toEqual([
      { date: '2026-07-25', count: 3, boxes: 5 },
      { date: '2026-07-24', count: 2, boxes: 2 },
    ]);
  });

  it('does not report persisted data when saving fails', async () => {
    const saveError = new Error('DB 저장 실패');
    const save = vi.fn().mockRejectedValue(saveError);
    const load = vi.fn();

    await expect(
      persistAndVerifyCoupangShipmentDateSummary(
        [{ date: '2026-07-25', count: 3, boxes: 5 }],
        { save, load },
      ),
    ).rejects.toBe(saveError);
    expect(load).not.toHaveBeenCalled();
  });

  it('rejects a save that cannot be verified by the following server read', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const load = vi.fn().mockResolvedValue({
      items: [
        { date: '2026-07-25', count: 3, boxes: 4, capturedAt: '2026-07-25T00:00:00.000Z' },
      ],
    });

    await expect(
      persistAndVerifyCoupangShipmentDateSummary(
        [{ date: '2026-07-25', count: 3, boxes: 5 }],
        { save, load },
      ),
    ).rejects.toThrow('발송일 요약 저장을 서버에서 확인하지 못했습니다. 다시 조회해주세요.');
  });
});
