import { Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import { ORG_LOCK_KEY, OperationLockKeySchema } from '@kiditem/shared/operation';
import { z } from 'zod';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../application/port/out/owner/operation-owner.decorator';

/** 켜는 환경 변수. 로컬·QA에서만 `1`. Office 배포 env에는 없다. */
export const TEST_OPERATION_KINDS_ENV = 'KIDITEM_TEST_OPERATION_KINDS';
export const TEST_ECHO_KIND = 'test.echo' as const;

export function testOperationKindsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TEST_OPERATION_KINDS_ENV] === '1';
}

const TestEchoScopeSchema = z.object({
  lockKeys: z.array(OperationLockKeySchema).min(1).default([ORG_LOCK_KEY]),
}).strict();

/**
 * 확장 새 런타임(KID-357)이 실행 계약을 끝까지 돌리는지 보는 더미 kind. 원장을 쓰지 않고
 * 받은 청크를 세어 `result`로 돌려준다. `KIDITEM_TEST_OPERATION_KINDS=1`일 때만 등록되며(로컬·QA),
 * 옛 실행 표가 모두 사라지는 조각(KID-365)에서 계약 스모크로 남길지 정한다.
 */
@OperationOwner()
@Injectable()
export class TestEchoOperationOwner implements OperationOwnerPort {
  readonly kind = TEST_ECHO_KIND;

  async plan(scope: JsonObject, _context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = TestEchoScopeSchema.parse(scope);
    return { lockKeys: parsed.lockKeys, plan: { echo: true, lockKeys: parsed.lockKeys } };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    _context: OperationFinalizeContext,
  ): Promise<{ result?: JsonObject }> {
    const items = chunks.reduce((sum, chunk) => sum + chunk.payload.length, 0);
    return { result: { chunks: chunks.length, items } };
  }
}
