import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { OperationView } from '@kiditem/shared/operation';
import { SourceFailureAlerts } from '../alerts/alerts.service';
import { OperationRepositoryAdapter } from '../common/operation/adapter/out/repository/operation.repository.adapter';
import { OperationOwnerRegistry } from '../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../common/operation/application/service/operation.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SOURCING_EXTENSION_OPERATION_OWNERS } from '../sourcing/adapter/in/operation/sourcing-extension-operation-owners';
import { SourcingOperationLedgerRepositoryAdapter } from '../sourcing/adapter/out/repository/sourcing-operation-ledger.repository.adapter';
import { TrendCollectionRepositoryAdapter } from '../sourcing/adapter/out/repository/trend-collection.repository.adapter';
import type { SalesProductDraftPort } from '../sourcing/application/port/out/cross-domain/sales-product-draft.port';
import { SourcingExtensionOperationService } from '../sourcing/application/service/sourcing-extension-operation.service';
import { TrendCollectService } from '../sourcing/application/service/trend-collect.service';
import { TEST_USER_ID } from './real-prisma';

export interface SourcingOperationChunk {
  chunkKind: string;
  payload: unknown[];
}

/**
 * 확장 구동 소싱 kind(KID-360)를 실제 실행 계약(OperationService + PG)과 실제 owner로 돌리는 시험 도구.
 * 확장 runner가 하는 순서 그대로: begin → 청크(종류별 순번) → finish(succeeded), finish가 거절되면
 * 그 코드로 finish(failed). Wing 계정 capability 자리는 이 조직의 쿠팡 계정 행을 본다.
 */
export function sourcingExtensionOperations(
  prisma: PrismaClient,
  drafts: SalesProductDraftPort,
  options: { alerts?: SourceFailureAlerts } = {},
) {
  const db = prisma as unknown as PrismaService;
  const trends = new TrendCollectService({} as never, {} as never, {} as never, {} as never,
    new TrendCollectionRepositoryAdapter(db), {} as never);
  const service = new SourcingExtensionOperationService(
    new SourcingOperationLedgerRepositoryAdapter(db, options.alerts ?? new SourceFailureAlerts(db), drafts),
    { isActiveCoupangAccount: async (organizationId, id) =>
      (await prisma.channelAccount.count({ where: { id, organizationId, channel: 'coupang' } })) === 1 },
    trends,
  );
  const registry = new OperationOwnerRegistry(undefined as never, undefined as never);
  for (const Owner of SOURCING_EXTENSION_OPERATION_OWNERS) registry.register(new Owner(service));
  const operations = new OperationService(new OperationRepositoryAdapter(db), registry);

  /** begin만 한다(같은 대상의 두 번째 begin이 막히는지 볼 때). */
  function start(organizationId: string, kind: string, scope: Record<string, unknown>, userId: string | null = TEST_USER_ID) {
    return operations.begin(organizationId, { kind, scope }, { userId });
  }

  /** 시작한 실행에 청크를 싣고 finish(succeeded); 거절되면 그 코드로 finish(failed). */
  async function complete(
    organizationId: string,
    begun: Awaited<ReturnType<typeof start>>,
    chunks: SourcingOperationChunk[] | ((plan: Record<string, unknown>) => SourcingOperationChunk[]),
  ): Promise<{ operation: OperationView; refusedWith: string | null }> {
    const sequences = new Map<string, number>();
    for (const chunk of typeof chunks === 'function' ? chunks(begun.operation.plan ?? {}) : chunks) {
      const sequence = (sequences.get(chunk.chunkKind) ?? 0) + 1;
      sequences.set(chunk.chunkKind, sequence);
      await operations.putChunk({
        organizationId,
        operationId: begun.operation.id,
        token: begun.token,
        chunkKind: chunk.chunkKind,
        sequence,
        request: { checksum: createHash('sha256').update(JSON.stringify(chunk.payload)).digest('hex'), payload: chunk.payload },
      });
    }
    try {
      const finished = await operations.finish({ organizationId, operationId: begun.operation.id, token: begun.token, request: { outcome: 'succeeded' } });
      return { operation: finished.operation, refusedWith: null };
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'RUNTIME_COLLECT_FAILED';
      const failed = await operations.finish({ organizationId, operationId: begun.operation.id, token: begun.token,
        request: { outcome: 'failed', errorCode: code, errorMessage: (error as Error).message } });
      return { operation: failed.operation, refusedWith: code };
    }
  }

  async function run(
    organizationId: string,
    kind: string,
    scope: Record<string, unknown>,
    chunks: SourcingOperationChunk[] | ((plan: Record<string, unknown>) => SourcingOperationChunk[]),
    userId: string | null = TEST_USER_ID,
  ): Promise<{ operation: OperationView; refusedWith: string | null }> {
    return complete(organizationId, await start(organizationId, kind, scope, userId), chunks);
  }

  return { operations, run, start, complete };
}
