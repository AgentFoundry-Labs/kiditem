import { describe, expect, it } from 'vitest';
import { RegistrationTargetUseCase } from './registration-target.usecase';
import type { RegistrationTargetRecord, RegistrationTargetRepositoryPort } from '../../port/out/persistence/registration-target.repository.port';

const org = 'org';
const product = { name: '공통 상품명', options: [
  { id: 'option-a', code: 'KID00000002', values: ['파랑'], salePrice: 3000, normalPrice: 5000 },
  { id: 'option-b', code: 'KID00000003', values: ['노랑'], salePrice: 4000, normalPrice: null },
] };
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
        displayName: null,
        registrationInput: {},
        selectedOptions: defaults.options.map(option => ({
          salesProductOptionId: option.id,
          salePrice: null,
          normalPrice: null,
          supplyPrice: null,
        })),
        product: defaults,
      });
      return id;
    },
    create: async (_org, input) => {
      const id = `target-${rows.size + 1}`;
      rows.set(id, { ...input, id, version: 1, product: defaults });
      return id;
    },
    update: async (_org, id, input) => {
      const row = rows.get(id)!;
      rows.set(id, { ...row, ...input, version: row.version + 1 });
    },
  };
  return { service: new RegistrationTargetUseCase(repository), defaults };
}
const input = {
  salesProductId: 'product', channelAccountId: 'account', displayName: null, registrationInput: {},
  selectedOptions: [{ salesProductOptionId: 'option-a', salePrice: null, normalPrice: null, supplyPrice: null }],
};

describe('registration target public port', () => {
  it('resolves a default target when no account settings exist', async () => {
    const { service } = setup();
    const target = await service.resolve(org, { salesProductId: 'product', channelAccountId: 'account' });
    expect(target).toMatchObject({
      salesProductId: 'product',
      channelAccountId: 'account',
      displayName: null,
      registrationInput: {},
      selectedOptions: [
        { salesProductOptionId: 'option-a', salePrice: null, normalPrice: null, supplyPrice: null },
        { salesProductOptionId: 'option-b', salePrice: null, normalPrice: null, supplyPrice: null },
      ],
      resolved: {
        name: '공통 상품명',
        options: [
          expect.objectContaining({ salesProductOptionId: 'option-a', salePrice: 3000, normalPrice: 5000 }),
          expect.objectContaining({ salesProductOptionId: 'option-b', salePrice: 4000, normalPrice: null }),
        ],
      },
    });
  });

  it('keeps multiple independently priced registrations for one product and account', async () => {
    const { service } = setup();
    const regular = await service.create(org, input);
    const event = await service.create(org, { ...input, displayName: '기획전', selectedOptions: [
      { ...input.selectedOptions[0], salePrice: 2500, supplyPrice: 1900 },
    ] });
    expect(event.id).not.toBe(regular.id);
    expect((await service.list(org, 'product')).map(target => target.resolved)).toEqual([
      { name: '공통 상품명', options: [expect.objectContaining({ salePrice: 3000, normalPrice: 5000, supplyPrice: null })] },
      { name: '기획전', options: [expect.objectContaining({ salePrice: 2500, normalPrice: 5000, supplyPrice: 1900 })] },
    ]);
  });

  it('applies edited common defaults only where no explicit target value exists', async () => {
    const { service, defaults } = setup();
    const target = await service.create(org, { ...input, displayName: '고정 상품명', selectedOptions: [
      { ...input.selectedOptions[0], salePrice: 0 },
      { salesProductOptionId: 'option-b', salePrice: null, normalPrice: null, supplyPrice: null },
    ] });
    defaults.name = '새 기본 이름';
    defaults.options[0].salePrice = 6000;
    defaults.options[1].salePrice = 7000;
    const read = await service.get(org, target.id);
    expect(read.resolved.name).toBe('고정 상품명');
    expect(read.resolved.options.map(option => option.salePrice)).toEqual([0, 7000]);
    expect(read.selectedOptions[1].salePrice).toBeNull();
  });

  it('returns only selected options and rejects a dangling option reference', async () => {
    const { service } = setup();
    const target = await service.create(org, input);
    expect(target.resolved.options.map(option => option.salesProductOptionId)).toEqual(['option-a']);
    await expect(service.create(org, { ...input, selectedOptions: [{ ...input.selectedOptions[0], salesProductOptionId: 'other-product-option' }] }))
      .rejects.toThrow('선택한 옵션이 해당 판매상품에 없습니다.');
  });
});
