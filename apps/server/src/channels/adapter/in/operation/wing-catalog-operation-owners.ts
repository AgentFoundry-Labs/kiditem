import { Inject, Injectable } from '@nestjs/common';
import {
  WING_CATALOG_DETAILS_KIND,
  WING_CATALOG_EXCEL_KIND,
  WING_CATALOG_LIST_KIND,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  WING_CATALOG_OPERATION_PORT,
  type WingCatalogOperationPort,
} from '../../../application/port/in/wing-catalog-operation.port';

/**
 * Wing 카탈로그 kind 셋의 owner 포트(ADR-0025, KID-354·351). 목록 → 상세는 목록 finalize의 `result.next`로
 * 확장 runner가 잇고, 엑셀은 웹 업로드(서버)와 확장 Wing 내려받기가 같은 kind로 보낸다. 셋 다 `onFailed`가
 * 없다 — 실패는 원장에 아무것도 쓰지 않고, 상세가 반영되지 않은 상품은 다음 목록이 다시 잡는다.
 */
@OperationOwner()
@Injectable()
export class WingCatalogListOperationOwner implements OperationOwnerPort {
  readonly kind = WING_CATALOG_LIST_KIND;
  constructor(@Inject(WING_CATALOG_OPERATION_PORT) private readonly catalog: WingCatalogOperationPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.catalog.planList(scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: await this.catalog.finalizeList(chunks, context) };
  }
}

@OperationOwner()
@Injectable()
export class WingCatalogDetailsOperationOwner implements OperationOwnerPort {
  readonly kind = WING_CATALOG_DETAILS_KIND;
  constructor(@Inject(WING_CATALOG_OPERATION_PORT) private readonly catalog: WingCatalogOperationPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.catalog.planDetails(scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: await this.catalog.finalizeDetails(chunks, context) };
  }
}

@OperationOwner()
@Injectable()
export class WingCatalogExcelOperationOwner implements OperationOwnerPort {
  readonly kind = WING_CATALOG_EXCEL_KIND;
  constructor(@Inject(WING_CATALOG_OPERATION_PORT) private readonly catalog: WingCatalogOperationPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.catalog.planExcel(scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: await this.catalog.finalizeExcel(chunks, context) };
  }
}

export const WING_CATALOG_OPERATION_OWNERS = [
  WingCatalogListOperationOwner,
  WingCatalogDetailsOperationOwner,
  WingCatalogExcelOperationOwner,
] as const;
