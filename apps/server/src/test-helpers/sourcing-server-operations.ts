import type { PrismaClient } from '@prisma/client';
import { SourceFailureAlerts } from '../alerts/alerts.service';
import { OperationRepositoryAdapter } from '../common/operation/adapter/out/repository/operation.repository.adapter';
import { OperationOwnerRegistry } from '../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../common/operation/application/service/operation.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SOURCING_SERVER_OPERATION_OWNERS } from '../sourcing/adapter/in/operation/sourcing-server-operation-owners';
import { SourcingOperationLedgerRepositoryAdapter } from '../sourcing/adapter/out/repository/sourcing-operation-ledger.repository.adapter';
import { SourcingServerOperationRepositoryAdapter } from '../sourcing/adapter/out/repository/sourcing-server-operation.repository.adapter';
import { SourcingSourcePublicationRepositoryAdapter } from '../sourcing/adapter/out/repository/sourcing-source-publication.repository.adapter';
import type { SalesProductDraftPort } from '../sourcing/application/port/out/cross-domain/sales-product-draft.port';
import { SourcingServerOperationService } from '../sourcing/application/service/sourcing-server-operation.service';
import { SourcingServerOperationRunner } from '../sourcing/application/service/sourcing-server-operation.runner';

/**
 * 서버 구동 소싱 kind(KID-389)를 실제 실행 계약(OperationService + PG)·실제 owner·실제 원장 writer로 돌리는 시험 도구.
 * 서비스 스펙은 공급자 포트만 가짜로 두고 이 runner를 넣는다.
 */
export function sourcingServerOperations(prisma: PrismaClient, drafts: SalesProductDraftPort) {
  const db = prisma as unknown as PrismaService;
  const service = new SourcingServerOperationService(
    new SourcingOperationLedgerRepositoryAdapter(db, drafts, new SourceFailureAlerts(db)),
  );
  const registry = new OperationOwnerRegistry(undefined as never, undefined as never);
  for (const Owner of SOURCING_SERVER_OPERATION_OWNERS) registry.register(new Owner(service));
  const operations = new OperationService(new OperationRepositoryAdapter(db), registry);
  const runner = new SourcingServerOperationRunner(operations, new SourcingServerOperationRepositoryAdapter(
    db, new SourcingSourcePublicationRepositoryAdapter(db)));
  return { operations, runner, service };
}
