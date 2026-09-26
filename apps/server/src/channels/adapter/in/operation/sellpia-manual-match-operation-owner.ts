import { Inject, Injectable } from '@nestjs/common';
import { SELLPIA_MANUAL_MATCH_KIND } from '@kiditem/shared/sellpia-operations';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  SELLPIA_MANUAL_MATCH_PORT,
  type SellpiaManualMatchPort,
} from '../../../application/port/in/listing/sellpia-manual-match.port';

/**
 * 셀피아 수동상품매칭 kind의 owner 포트(ADR-0025, KID-363). producer는 확장 수집기
 * `collectors/channels.sellpia_manual_match`다. `onFailed`가 없다 — 실패는 이전 스냅샷을 그대로 둔다.
 */
@OperationOwner()
@Injectable()
export class SellpiaManualMatchOperationOwner implements OperationOwnerPort {
  readonly kind = SELLPIA_MANUAL_MATCH_KIND;
  constructor(@Inject(SELLPIA_MANUAL_MATCH_PORT) private readonly manualMatch: SellpiaManualMatchPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.manualMatch.plan(scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: await this.manualMatch.finalize(chunks, context) };
  }
}
