import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { SourcingModule } from '../sourcing.module';
import { SalesProductDraftAdapter } from '../adapter/out/channels/sales-product-draft.adapter';
import { SALES_PRODUCT_DRAFT_PORT } from '../application/port/out/cross-domain/sales-product-draft.port';

type Binding = { provide?: unknown; useExisting?: unknown };

function providersOf(module: unknown): Binding[] {
  return (Reflect.getMetadata('providers', module as never) ?? []) as Binding[];
}

/**
 * 후보를 만드는 모듈은 모두 초안 계약을 들고 있어야 한다(KID-310). 하나라도 빠지면 그 입구로
 * 들어온 수집상품만 편집 정본 없이 남아, 화면에서 아무것도 할 수 없는 줄이 된다.
 */
describe('판매상품 초안 계약 배선', () => {
  it.each([
    ['SourcingModule', SourcingModule],
  ])('%s 이 초안 계약을 제공한다', (_name, module) => {
    expect(providersOf(module)).toContain(SalesProductDraftAdapter);
    expect(providersOf(module).find((provider) =>
      typeof provider === 'object' && provider !== null && provider.provide === SALES_PRODUCT_DRAFT_PORT))
      .toMatchObject({ useExisting: SalesProductDraftAdapter });
  });
});
