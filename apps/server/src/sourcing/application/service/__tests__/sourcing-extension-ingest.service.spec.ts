import { describe, expect, it, vi } from 'vitest';
import { SourcingExtensionIngestService } from '../sourcing-extension-ingest.service';

const context = { organizationId: 'org-1', userId: 'user-1' };
const v1 = {
  page_type: 'detail',
  source_url: 'https://detail.1688.com/offer/607635921546.html',
  source_platform: '1688',
  product_id: '607635921546',
  title: '어린이 실리콘 식판',
  price_min: 12.5,
  moq: 2,
  supplier_name: '샘플 공급사',
  sku_list: [{ sku_id: 'sku-1', price: 12.5 }],
  price_tiers: [{ beginAmount: 2, price: 12.5 }],
};

function subject() {
  const collections = {
    execute: vi.fn(async (_claim, collector) => {
      await collector({
        permit: {
          runId: 'run-1', organizationId: 'org-1', sourceKey: '1688.product_extension',
          scopeKey: 'detail', targetKey: '607635921546:', leaseToken: 'lease', generation: 1,
          entitlementVersionId: 'entitlement-1', entitlementVersionHash: 'a'.repeat(64),
          leaseExpiresAt: new Date(),
        },
        checkpoint: vi.fn(),
      });
      return { kind: 'committed', runId: 'run-1', acceptedCount: 1, duplicateCount: 0, staleDiscardedCount: 0 };
    }),
  };
  return { service: new SourcingExtensionIngestService(collections as never), collections };
}

describe('SourcingExtensionIngestService', () => {
  it('preserves the deployed v1 commercial fields and gates candidate projection after collection commit', async () => {
    const { service, collections } = subject();

    await expect(service.ingestV1(context, v1)).resolves.toEqual({
      ok: true, message: 'collected', product_count: 1,
    });
    expect(collections.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: '1688.product_extension', triggerKind: 'extension' }),
      expect.any(Function),
    );
    const collector = collections.execute.mock.calls[0][1];
    const output = await collector({
      permit: {
        runId: 'run-1', organizationId: 'org-1', sourceKey: '1688.product_extension',
        scopeKey: 'detail', targetKey: '607635921546:', leaseToken: 'lease', generation: 1,
        entitlementVersionId: 'entitlement-1', entitlementVersionHash: 'a'.repeat(64),
        leaseExpiresAt: new Date(),
      }, checkpoint: vi.fn(),
    });
    expect(output.typedRecords).toContainEqual(expect.objectContaining({
      kind: 'extension_candidate',
      row: expect.objectContaining({
        costCny: 12.5,
        externalOfferId: '607635921546',
        rawData: expect.objectContaining({ moq: 2, supplier_name: '샘플 공급사' }),
      }),
    }));
  });

  it('does not project a candidate when the entitlement claim is denied', async () => {
    const { service, collections } = subject();
    collections.execute.mockRejectedValueOnce(new Error('source_entitlement_missing'));

    await expect(service.ingestV1(context, v1)).rejects.toThrow('source_entitlement_missing');
  });
});
