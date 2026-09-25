import type { PrismaClient } from '@prisma/client';
import { OperationRepositoryAdapter } from '../../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OperationOwnerRegistry } from '../../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../../common/operation/application/service/operation.service';
import { AI_DIRECT_JOB_OPERATION_OWNERS } from '../../adapter/in/operation/ai-direct-job-operation-owners';
import { AiDirectJobOperationsAdapter } from '../../adapter/out/runtime/ai-direct-job-operations.adapter';
import type { AiDirectJobRuntimeConfig } from '../../application/service/ai-direct-job.config';
import type { AiDirectJobProcessor } from '../../application/service/ai-direct-job-processor.service';

export const AI_DIRECT_JOB_TEST_CONFIG: AiDirectJobRuntimeConfig = {
  workerEnabled: false,
  workerIntervalMs: 1_000,
  workerMaxIntervalMs: 10_000,
  workerErrorMaxIntervalMs: 30_000,
  leaseHeartbeatMs: 5_000,
  leaseMs: 60_000,
  providerTimeoutMs: 120_000,
  retryDelaysMs: [5_000, 30_000, 120_000],
};

/**
 * 실제 실행 계약(서비스 · 저장소 · owner 등록) 위의 AI job 문. PG 스펙이 Nest 없이 조립한다.
 * `processor`는 모델 호출(AI 게이트웨이)과 결과 반영(sink)의 자리로, 스펙마다 진짜 sink를 꽂거나 기록만 한다.
 */
export function aiDirectJobOperations(
  prisma: PrismaClient,
  processor: Pick<AiDirectJobProcessor, 'project' | 'projectFailure'>,
  config: AiDirectJobRuntimeConfig = AI_DIRECT_JOB_TEST_CONFIG,
) {
  const registry = new OperationOwnerRegistry(null as never, null as never);
  const operations = new OperationService(new OperationRepositoryAdapter(prisma as never), registry);
  for (const Owner of AI_DIRECT_JOB_OPERATION_OWNERS) registry.register(new Owner(processor as never, config));
  return { operations, jobs: new AiDirectJobOperationsAdapter(operations), config };
}
