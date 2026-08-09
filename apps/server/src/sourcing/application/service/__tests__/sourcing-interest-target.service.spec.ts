import { describe, expect, it, vi } from 'vitest';
import { SourcingInterestTargetService } from '../sourcing-interest-target.service';

describe('SourcingInterestTargetService', () => {
  it('normalizes a keyword into one server-owned target key', async () => {
    const repository = {
      list: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(async (command) => command),
    };
    const service = new SourcingInterestTargetService(repository as never);

    await expect(service.upsert({
      organizationId: 'org-1',
      targetType: 'keyword',
      source: 'manual',
      keyword: '  포켓몬 카드  ',
    })).resolves.toMatchObject({
      targetKey: 'keyword:포켓몬카드',
      label: '포켓몬 카드',
      keyword: '포켓몬 카드',
    });
  });

  it('keeps product identity independent from its display label', async () => {
    const repository = {
      list: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(async (command) => command),
    };
    const service = new SourcingInterestTargetService(repository as never);

    await expect(service.upsert({
      organizationId: 'org-1',
      targetType: 'product',
      source: 'today_recommendation',
      productId: 'product-1',
      itemId: 'item-2',
      vendorItemId: 'vendor-3',
      productName: '상품명 A',
      label: '표시명 B',
    })).resolves.toMatchObject({
      targetKey: 'product:product-1:item-2:vendor-3',
      label: '표시명 B',
      productName: '상품명 A',
    });
  });
});
