import { describe, expect, it } from 'vitest';
import { RegistrationTargetUseCase } from './registration-target.usecase';
import type { RegistrationTargetRecord, RegistrationTargetRepositoryPort } from '../../port/out/persistence/registration-target.repository.port';

const org = 'org';
const product = { name: '공통 상품명', options: [
  { id: 'option-a', code: 'KID00000002', values: ['파랑'], salePrice: 3000, normalPrice: 5000 },
  { id: 'option-b', code: 'KID00000003', values: ['노랑'], salePrice: 4000, normalPrice: null },
] };
const emptyMallInput = { mallCategory: null, mallFields: {}, adapter: {} };

function setup() {
  const rows = new Map<string, RegistrationTargetRecord>();
  const defaults = structuredClone(product);
  const repository: RegistrationTargetRepositoryPort = {
    list: async () => [...rows.values()].map(row => ({ ...row, product: defaults })),
    get: async (_org, id) => rows.has(id) ? { ...rows.get(id)!, product: defaults } : null,
    resolve: async (_org, input) => {
      // 상품 × 몰 계정당 활성 설정은 하나다(KID-310) — 고를 것이 없다.
      const existing = [...rows.values()].filter(row => row.salesProductId === input.salesProductId
        && row.channelAccountId === input.channelAccountId);
      if (existing[0]) return existing[0].id;
      const id = `target-${rows.size + 1}`;
      rows.set(id, {
        id,
        salesProductId: input.salesProductId,
        channelAccountId: input.channelAccountId,
        version: 1,
        registrationInput: emptyMallInput,
        selectedThumbnailAssetId: null,
        selectedDetailPageRevisionId: null,
        selectedOptions: defaults.options.map(option => ({ salesProductOptionId: option.id })),
        product: defaults,
      });
      return id;
    },
    archive: async (_org, id) => { rows.delete(id); },
    create: async () => { throw new Error('the public port never creates a target directly'); },
    update: async (_org, id, input) => {
      const row = rows.get(id)!;
      const { expectedVersion: _version, ...values } = input;
      rows.set(id, { ...row, ...values, version: row.version + 1 });
    },
  };
  return { service: new RegistrationTargetUseCase(repository), defaults };
}

describe('registration target public port', () => {
  it('resolves a default target that selects every option and stores no product facts', async () => {
    const { service } = setup();
    const target = await service.resolve(org, { salesProductId: 'product', channelAccountId: 'account' });
    expect(target).toMatchObject({
      salesProductId: 'product',
      channelAccountId: 'account',
      registrationInput: emptyMallInput,
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
      selectedOptions: [{ salesProductOptionId: 'option-a' }, { salesProductOptionId: 'option-b' }],
      resolved: {
        name: '공통 상품명',
        options: [
          expect.objectContaining({ salesProductOptionId: 'option-a', salePrice: 3000, normalPrice: 5000 }),
          expect.objectContaining({ salesProductOptionId: 'option-b', salePrice: 4000, normalPrice: null }),
        ],
      },
    });
    expect(target).not.toHaveProperty('displayName');
  });

  it('reads the name and prices from the selling product at use time, so a product edit shows everywhere', async () => {
    const { service, defaults } = setup();
    const resolved = await service.resolve(org, { salesProductId: 'product', channelAccountId: 'account' });
    defaults.name = '새 기본 이름';
    defaults.options[0]!.salePrice = 6000;
    defaults.options[1]!.salePrice = 7000;

    const read = await service.get(org, resolved.id);
    expect(read.resolved.name).toBe('새 기본 이름');
    expect(read.resolved.options.map(option => option.salePrice)).toEqual([6000, 7000]);
  });

  it('returns only selected options and rejects a dangling option reference', async () => {
    const { service } = setup();
    const resolved = await service.resolve(org, { salesProductId: 'product', channelAccountId: 'account' });
    const target = await service.update(org, resolved.id, {
      expectedVersion: resolved.version, registrationInput: emptyMallInput,
      selectedThumbnailAssetId: null, selectedDetailPageRevisionId: null,
      selectedOptions: [{ salesProductOptionId: 'option-a' }],
    });
    expect(target.resolved.options.map(option => option.salesProductOptionId)).toEqual(['option-a']);
    await expect(service.update(org, resolved.id, {
      expectedVersion: target.version, registrationInput: emptyMallInput,
      selectedThumbnailAssetId: null, selectedDetailPageRevisionId: null,
      selectedOptions: [{ salesProductOptionId: 'other-product-option' }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', kind: 'validation' });
  });
});
