import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { SalesProductRepositoryAdapter } from '../channels/adapter/out/persistence/sales-product.repository.adapter';
import { RegistrationTargetRepositoryAdapter } from '../channels/adapter/out/persistence/registration-target.repository.adapter';
import { SalesProductUseCase } from '../channels/application/service/sales-product/sales-product.usecase';
import { SalesProductDraftAdapter } from '../sourcing/adapter/out/channels/sales-product-draft.adapter';
import { productTransactionalRead } from '../channels/__tests__/product-transactional-read.fake';
import type { SalesProductDraftPort } from '../sourcing/application/port/out/cross-domain/sales-product-draft.port';

/**
 * 수집은 원본 기록 한 줄과 그 판매상품 초안 한 줄을 한 커밋에 만든다(KID-313). 원본 기록
 * 저장소를 손으로 세우는 PG spec 이 그 계약 없이 돌면 실제 배선과 다른 것을 재는 것이므로, 진짜
 * Channels 초안 경로를 그대로 엮어 준다.
 */
export function realSalesProductDraftPort(prisma: PrismaClient): SalesProductDraftPort {
  const targets = new RegistrationTargetRepositoryAdapter(
    prisma as unknown as PrismaService,
    productTransactionalRead(),
  );
  const repository = new SalesProductRepositoryAdapter(
    prisma as unknown as PrismaService,
    productTransactionalRead(),
    targets,
  );
  return new SalesProductDraftAdapter(new SalesProductUseCase(repository));
}

/**
 * 원본 기록을 입장시키지 않는 원천(트렌드 · 키워드 · 라이브커머스 …)의 attempt 저장소에 넘기는 초안
 * 계약. 불리면 그 원천이 원본 기록을 만들려 한 것이라 테스트가 실패해야 한다.
 */
export const unusedSalesProductDraftPort: SalesProductDraftPort = {
  findForSourceRecord: async () => { throw new Error('this source never admits a source record'); },
  createDraft: async () => { throw new Error('this source never admits a source record'); },
  getDraft: async () => { throw new Error('this source never admits a source record'); },
};
