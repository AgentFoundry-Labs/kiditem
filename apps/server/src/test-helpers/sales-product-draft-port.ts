import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { SalesProductRepositoryAdapter } from '../channels/adapter/out/persistence/sales-product.repository.adapter';
import { RegistrationTargetRepositoryAdapter } from '../channels/adapter/out/persistence/registration-target.repository.adapter';
import { SalesProductUseCase } from '../channels/application/service/sales-product/sales-product.usecase';
import { SalesProductDraftAdapter } from '../sourcing/adapter/out/channels/sales-product-draft.adapter';
import { productTransactionalRead } from '../channels/__tests__/product-transactional-read.fake';
import type { SalesProductDraftPort } from '../sourcing/application/port/out/cross-domain/sales-product-draft.port';

/**
 * 수집은 후보 한 줄과 그 판매상품 초안 한 줄을 함께 만든다(KID-310). 후보 저장소를 손으로
 * 세우는 PG spec 이 그 계약 없이 돌면 실제 배선과 다른 것을 재는 것이므로, 진짜 Channels
 * 초안 경로를 그대로 엮어 준다.
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
