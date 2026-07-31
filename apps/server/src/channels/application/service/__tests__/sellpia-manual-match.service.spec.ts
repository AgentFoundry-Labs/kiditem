import { describe, expect, it, vi } from 'vitest';
import { SellpiaManualMatchService } from '../sellpia-manual-match.service';

describe('SellpiaManualMatchService', () => {
  it('publishes an exact active-code snapshot and folds presentation duplicates', async () => {
    const inventory = {
      listActiveForMatching: vi.fn().mockResolvedValue([{
        sellpiaInventorySkuId: '11111111-1111-4111-8111-111111111111',
        code: '6402-1',
      }]),
    };
    const repository = {
      getCurrentStatus: vi.fn().mockResolvedValue(null),
      listCurrentChannelAliasCandidates: vi.fn().mockResolvedValue([
        '아동 양말 2개',
      ]),
      replaceCurrent: vi.fn().mockImplementation(async (input) => input.status),
    };
    const service = new SellpiaManualMatchService(inventory as never, repository as never);

    const result = await service.import('org-a', {
      source: 'sellpia_product_manual_match',
      version: 1,
      targetCount: 1,
      targetCodes: ['6402-1'],
      rowCount: 3,
      rows: [
        { productCode: '6402-1', aliasTitle: '과거에만 매칭한 상품', itemCount: 12, matchedType: 'M', evidenceCount: 1 },
        { productCode: '6402-1', aliasTitle: '아동 양말 2개', itemCount: 2, matchedType: 'M', evidenceCount: 1 },
        { productCode: '6402-1', aliasTitle: '아동-양말 2개', itemCount: 2, matchedType: 'P', evidenceCount: 2 },
      ],
    });

    expect(result.status).toMatchObject({ targetCount: 1, matchedTargetCount: 1, aliasCount: 1 });
    expect(repository.replaceCurrent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a',
      rows: [expect.objectContaining({
        normalizedAlias: '아동양말2개',
        itemCount: 2,
        matchedType: 'M',
        evidenceCount: 3,
      })],
    }));
  });

  it('rejects a snapshot when the active target set changed', async () => {
    const service = new SellpiaManualMatchService({
      listActiveForMatching: vi.fn().mockResolvedValue([{
        sellpiaInventorySkuId: '11111111-1111-4111-8111-111111111111',
        code: '6402-2',
      }]),
    } as never, {
      listCurrentChannelAliasCandidates: vi.fn().mockResolvedValue([]),
      replaceCurrent: vi.fn(),
    } as never);

    await expect(service.import('org-a', {
      source: 'sellpia_product_manual_match',
      version: 1,
      targetCount: 1,
      targetCodes: ['6402-1'],
      rowCount: 0,
      rows: [],
    })).rejects.toThrow(/changed during manual-match collection/i);
  });
});
