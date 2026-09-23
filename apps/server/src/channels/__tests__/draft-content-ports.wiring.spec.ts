import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { SalesProductModule } from '../sales-product.module';
import { ChannelsRegistrationExecutionModule } from '../channels-registration-execution.module';
import { SalesProductWorkspaceArchiveAdapter } from '../adapter/out/repository/sales-product-workspace-archive.adapter';
import { SalesProductThumbnailSourceAdapter } from '../adapter/out/ai/sales-product-thumbnail-source.adapter';
import { RegistrationDraftAdapter } from '../adapter/out/persistence/registration-draft.adapter';
import { SalesProductUseCase } from '../application/service/sales-product/sales-product.usecase';
import { SALES_PRODUCT_WORKSPACE_ARCHIVE_PORT } from '../application/port/out/ai/sales-product-workspace-archive.port';
import { SALES_PRODUCT_THUMBNAIL_SOURCE_PORT } from '../application/port/out/ai/sales-product-thumbnail-source.port';

const PROVIDERS_KEY = 'providers';

type Binding = { provide?: unknown; useExisting?: unknown; inject?: unknown[] };

function providersOf(module: unknown): Binding[] {
  return (Reflect.getMetadata(PROVIDERS_KEY, module as never) ?? []) as Binding[];
}

function bindingFor(module: unknown, token: symbol | unknown): Binding | undefined {
  return providersOf(module).find((provider) =>
    typeof provider === 'object' && provider !== null && provider.provide === token);
}

/**
 * 두 AI 계약은 **주입되지 않으면 조용히 꺼진다** — 초안을 내려도 작업공간이 남고, 대표 사진
 * 울타리가 모든 주소를 통과시킨다(KID-310). 그래서 배선 자체를 잠근다.
 */
describe('초안 콘텐츠 계약 배선', () => {
  it('판매상품 초안을 내릴 때 AI 작업공간 보관을 부를 수 있게 배선한다', () => {
    expect(bindingFor(SalesProductModule, SALES_PRODUCT_WORKSPACE_ARCHIVE_PORT))
      .toMatchObject({ useExisting: SalesProductWorkspaceArchiveAdapter });
    expect(providersOf(SalesProductModule)).toContain(SalesProductWorkspaceArchiveAdapter);
    // 주입 목록에 들어가야 usecase 의 보관 호출이 산다.
    expect(bindingFor(SalesProductModule, SalesProductUseCase)?.inject)
      .toContain(SALES_PRODUCT_WORKSPACE_ARCHIVE_PORT);
  });

  it('대표 사진 울타리가 볼 생성 썸네일 목록을 등록 실행 모듈이 제공한다', () => {
    expect(bindingFor(ChannelsRegistrationExecutionModule, SALES_PRODUCT_THUMBNAIL_SOURCE_PORT))
      .toMatchObject({ useExisting: SalesProductThumbnailSourceAdapter });
    expect(providersOf(ChannelsRegistrationExecutionModule))
      .toContain(SalesProductThumbnailSourceAdapter);
  });

  /**
   * 선택 주입이면 배선을 빠뜨려도 부트가 성공하고 울타리만 조용히 꺼진다 — 그 상태를 알아챌
   * 방법이 없다. 필수 주입이라야 빠진 배선이 부트에서 드러난다.
   */
  it('생성 썸네일 목록을 쓰는 소비자는 그것을 선택 주입으로 받지 않는다', () => {
    for (const consumer of [RegistrationDraftAdapter]) {
      expect(Reflect.getMetadata('optional:paramtypes', consumer) ?? []).toEqual([]);
    }
  });
});
