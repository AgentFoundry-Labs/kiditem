import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { SalesProductRepositoryAdapter } from '../channels/adapter/out/persistence/sales-product.repository.adapter';
import { RegistrationTargetRepositoryAdapter } from '../channels/adapter/out/persistence/registration-target.repository.adapter';
import { SalesProductUseCase } from '../channels/application/service/sales-product/sales-product.usecase';
import { SalesProductDraftAdapter } from '../sourcing/adapter/out/channels/sales-product-draft.adapter';
import { productTransactionalRead } from '../channels/__tests__/product-transactional-read.fake';
import type { SalesProductDraftPort } from '../sourcing/application/port/out/cross-domain/sales-product-draft.port';
import { SalesProductWorkspaceArchiveAdapter } from '../channels/adapter/out/repository/sales-product-workspace-archive.adapter';
import { SourceRecordAdapter } from '../channels/adapter/out/sourcing/source-record.adapter';
import { SalesProductWorkspaceArchiveService } from '../content/application/service/sales-product-workspace-archive.service';
import { SalesProductWorkspaceArchiveRepositoryAdapter } from '../content/adapter/out/repository/sales-product-workspace-archive.repository.adapter';
import { SourceRecordRepositoryAdapter } from '../sourcing/adapter/out/repository/source-record.repository.adapter';
import type { SalesProductWorkspaceArchivePort } from '../channels/application/port/out/ai/sales-product-workspace-archive.port';
import type { ChannelSourceRecordPort } from '../channels/application/port/out/sourcing/source-record.port';

/**
 * 초안 삭제가 함께 부르는 두 owner 계약(콘텐츠 작업공간 보관 · 원본 기록 삭제)을 실제 어댑터로 엮는다.
 * `SalesProductUseCase` 는 둘 다 요구한다 — 하나라도 빠지면 삭제가 반쪽이 되기 때문이다.
 */
export function realDraftDeletionPorts(prisma: PrismaClient): [SalesProductWorkspaceArchivePort, ChannelSourceRecordPort] {
  return [
    new SalesProductWorkspaceArchiveAdapter(
      new SalesProductWorkspaceArchiveService(new SalesProductWorkspaceArchiveRepositoryAdapter()),
    ),
    new SourceRecordAdapter(new SourceRecordRepositoryAdapter(prisma as unknown as PrismaService)),
  ];
}

/** 초안을 지우지 않는 단위 시험의 두 계약. 불리면 시험이 실패한다. */
export const untouchedDraftDeletionPorts: [SalesProductWorkspaceArchivePort, ChannelSourceRecordPort] = [
  { archiveSalesProductWorkspace: async () => { throw new Error('this test never deletes a draft'); } },
  { deleteForDraft: async () => { throw new Error('this test never deletes a draft'); } },
];

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
  return new SalesProductDraftAdapter(new SalesProductUseCase(repository, ...realDraftDeletionPorts(prisma)));
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
