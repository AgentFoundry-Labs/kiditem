import { Inject, Injectable } from '@nestjs/common';
import { ROCKET_MATCHING_CSV_KIND } from '@kiditem/shared/channels-operations';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT,
  type RocketSellpiaMatchingCsvImportPort,
} from '../../../application/port/in/rocket-sellpia-matching-csv-import.port';

/**
 * 로켓-셀피아 매칭 CSV kind의 owner 포트(ADR-0025, KID-363). producer는 업로드를 받은 서버 자신이다.
 * `onFailed`가 없다 — 실패는 원장에 아무것도 쓰지 않는다.
 */
@OperationOwner()
@Injectable()
export class RocketMatchingCsvOperationOwner implements OperationOwnerPort {
  readonly kind = ROCKET_MATCHING_CSV_KIND;
  constructor(@Inject(ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT) private readonly csv: RocketSellpiaMatchingCsvImportPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.csv.planCsv(scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: await this.csv.finalizeCsv(chunks, context) };
  }
}
