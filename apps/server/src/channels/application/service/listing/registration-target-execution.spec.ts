import { describe, expect, it, vi } from 'vitest';
import { RegistrationExecutionService } from '../registration/registration-execution.service';
import type { SalesProduct, PrepareTargetExecutionInput } from '@kiditem/shared/sales-product';
import type { RegistrationExecutionRepositoryPort } from '../../port/out/repository/registration-execution.repository.port';
import type { RegistrationTargetPort } from '../../port/in/registration-target.port';
import type { SalesProductPort } from '../../port/in/sales-product.port';

const request: PrepareTargetExecutionInput = { expectedVersion: 3, kind: 'register', idempotencyKey: 'intent-1', applyCompositionTemplate: false };
function setup() {
  const product = { id: 'product', name: '공통 이름', version: 4, channelOverrides: [{ channelAccountId: 'account', salePrice: 9000, name: '이전 계정 요약' }], options: [
    { id: 'a', optionCode: 'KID00000002', salePrice: 3000, normalPrice: 5000 },
    { id: 'b', optionCode: 'KID00000003', salePrice: 4000, normalPrice: null },
  ] } as SalesProduct;
  const target = {
    id: 'target', salesProductId: 'product', channelAccountId: 'account', version: 3,
    registrationInput: { mallCategory: { key: 'provider-category', label: null }, mallFields: {}, adapter: {} },
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: 'revision-chosen' as string | null,
    selectedOptions: [{ salesProductOptionId: 'b' }, { salesProductOptionId: 'a' }],
  };
  const executions = { findTargetReplay: vi.fn().mockResolvedValue(null),
    prepareTarget: vi.fn().mockImplementation(async input => structuredClone(input.snapshot)) };
  const targets = { get: vi.fn().mockImplementation(async () => structuredClone(target)) };
  const products = { get: vi.fn().mockImplementation(async () => structuredClone(product)) };
  // 상세는 Content revision 에서 온다 — 경계 밖이라 읽은 값만 정해 준다.
  const detailPages = {
    read: vi.fn().mockResolvedValue({ revisionId: 'revision-chosen', html: '<p>상세</p>', extraHtml: [], imageUrls: [] }),
    readMany: vi.fn(),
    importFromSource: vi.fn(),
  };
  const service = new RegistrationExecutionService(executions as unknown as RegistrationExecutionRepositoryPort,
    {} as never, {} as never, products as unknown as SalesProductPort, targets as unknown as RegistrationTargetPort,
    { preview: vi.fn(), prepare: vi.fn(), assertEligible: vi.fn() }, detailPages);
  return { service, executions, product, target, targets, products, detailPages };
}

describe('registration target execution public capability', () => {
  it('freezes the selected options at the selling product\'s name and prices, in the target\'s order', async () => {
    const { service, product, executions } = setup();
    await service.prepareTargetExecution('org', 'target', 'actor', request);
    const frozen = executions.prepareTarget.mock.calls[0][0].snapshot;
    expect(frozen.product).toMatchObject({ name: '공통 이름', version: 4, options: [
      { id: 'b', salePrice: 4000, normalPrice: null },
      { id: 'a', salePrice: 3000, normalPrice: 5000 },
    ] });
    expect(frozen.product.channelOverrides).toEqual([]);
    expect(frozen.registrationInput).toEqual({ mallCategory: { key: 'provider-category', label: null }, mallFields: {}, adapter: {} });
    expect(frozen.supplyPrices).toEqual([
      { salesProductOptionId: 'b', supplyPrice: null }, { salesProductOptionId: 'a', supplyPrice: null },
    ]);
    product.options[0]!.salePrice = 9999;
    expect(frozen.product.options[1].salePrice).toBe(3000);
    expect(executions.prepareTarget.mock.calls[0][0]).toMatchObject({ organizationId: 'org', requestedByUserId: 'actor' });
  });

  it('freezes the detail of the revision the target chose, read from the content at preparation', async () => {
    const { service, executions, detailPages, target } = setup();
    await service.prepareTargetExecution('org', 'target', 'actor', request);

    expect(detailPages.read).toHaveBeenCalledWith({
      organizationId: 'org', salesProductId: 'product', selectedDetailPageRevisionId: 'revision-chosen',
    });
    expect(executions.prepareTarget.mock.calls[0][0].snapshot.detailPage)
      .toEqual({ revisionId: 'revision-chosen', html: '<p>상세</p>', extraHtml: [] });

    target.selectedDetailPageRevisionId = null;
    detailPages.read.mockResolvedValue(null);
    await service.prepareTargetExecution('org', 'target', 'actor', { ...request, idempotencyKey: 'intent-2' });
    expect(executions.prepareTarget.mock.calls[1][0].snapshot.detailPage).toBeNull();
  });

  it('returns the original execution for a repeated intent even after settings were edited', async () => {
    const { service, executions, targets, products } = setup();
    const prior = { executionId: 'original', payloadHash: 'original-hash', maySubmit: false };
    executions.findTargetReplay.mockResolvedValue(prior);
    targets.get.mockRejectedValue(new Error('changed settings must not be re-resolved for a replay'));
    expect(await service.prepareTargetExecution('org', 'target', 'actor', request)).toBe(prior);
    expect(products.get).not.toHaveBeenCalled();
  });

  it('rejects a stale target version before preparing a new submission', async () => {
    const { service, executions } = setup();
    await expect(service.prepareTargetExecution('org', 'target', 'actor', { ...request, expectedVersion: 2 })).rejects.toThrow('등록 설정이 변경');
    expect(executions.prepareTarget).not.toHaveBeenCalled();
  });

  it('rejects an empty selection and a selection from another product', async () => {
    const { service, target, executions } = setup();
    target.selectedOptions = [];
    await expect(service.prepareTargetExecution('org', 'target', 'actor', request)).rejects.toThrow('옵션을 선택');
    target.selectedOptions = [{ salesProductOptionId: 'foreign-option' }];
    await expect(service.prepareTargetExecution('org', 'target', 'actor', request)).rejects.toThrow('해당 판매상품');
    expect(executions.prepareTarget).not.toHaveBeenCalled();
  });

  it.each(['update', 'sold_out', 'resume', 'composition_change'] as const)('requires the actual listing identity for %s', async kind => {
    const { service, executions } = setup();
    await expect(service.prepareTargetExecution('org', 'target', 'actor', { ...request, kind })).rejects.toThrow('기존 쇼핑몰 상품');
    expect(executions.prepareTarget).not.toHaveBeenCalled();
  });
  it('freezes the explicit price-only intent and the selling product price for the actual listing option', async () => {
    const { service, product, executions } = setup();
    product.channelListings = [{ id: 'listing', channelAccountId: 'account', mallKey: 'kakao',
      options: [{ salesProductOptionId: 'b', salePrice: 3500 }] }] as SalesProduct['channelListings'];
    await service.prepareTargetExecution('org', 'target', 'actor', {
      ...request, kind: 'update', channelListingId: 'listing', updateFields: ['salePrice'],
    });
    expect(executions.prepareTarget.mock.calls[0][0].snapshot).toMatchObject({
      kind: 'update', channelListingId: 'listing', updateFields: ['salePrice'],
      product: { options: [{ id: 'b', salePrice: 4000 }, { id: 'a', salePrice: 3000 }] },
    });
  });

  it('rejects missing update fields, a foreign listing, and an unsupported provider before creating intent', async () => {
    const { service, product, executions } = setup();
    const update = { ...request, kind: 'update' as const, channelListingId: 'listing' };
    await expect(service.prepareTargetExecution('org', 'target', 'actor', update)).rejects.toThrow('판매가 항목');
    product.channelListings = [];
    await expect(service.prepareTargetExecution('org', 'target', 'actor', {
      ...update, updateFields: ['salePrice'],
    })).rejects.toThrow('단일 옵션');
    product.channelListings = [{ id: 'listing', channelAccountId: 'account', mallKey: 'naver',
      options: [{ salesProductOptionId: 'b', salePrice: 3500 }] }] as SalesProduct['channelListings'];
    await expect(service.prepareTargetExecution('org', 'target', 'actor', {
      ...update, updateFields: ['salePrice'],
    })).rejects.toThrow('가격 전송 범위');
    expect(executions.prepareTarget).not.toHaveBeenCalled();
  });

});
