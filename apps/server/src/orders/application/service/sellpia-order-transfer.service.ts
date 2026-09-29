import { Inject, Injectable } from '@nestjs/common';
import { KiditemNotFoundError, KiditemPreconditionError } from '@kiditem/shared/errors';
import type { OperationPlanResult } from '@kiditem/shared/operation';
import {
  SELLPIA_ACTION_LOCK_KEY,
  SELLPIA_ORDER_TRANSFER_KIND,
  SellpiaOrderTransferPlanSchema,
  type SellpiaOrderTransferPlan,
  type SellpiaTransferTransport,
} from '@kiditem/shared/orders-action-operations';
import { COUPANG_DIRECTSHIP_KIND } from '@kiditem/shared/orders-operations';
import {
  OPERATION_PORT,
  type OperationPort,
} from '../../../common/operation/application/port/in/operation.port';
import { CoupangDirectshipService } from '../../coupang-directship/coupang-directship.service';
import {
  COUPANG_DIRECT_ORDER_COLLECTION_PORT,
  type CoupangDirectOrderCollectionPort,
} from '../port/in/coupang-direct-order-collection.port';
import { sellpiaOrderNumbersFromFile } from '../../domain/sellpia-order-targets';
import {
  readSellpiaTransferPlan,
  sameOrderNumbers,
  sellpiaTransferScope,
  sellpiaTransferTransport,
} from '../../domain/sellpia-order-transfer-operation';
import { MallOrdersOperationService } from './mall-orders-operation.service';

/** 원천 실행에서 다시 만든 셀피아 업로드 파일. */
export interface SellpiaTransferFile {
  bytes: Buffer;
  fileName: string;
  contentType: string;
  orderNumbers: string[];
}

const XLS_CONTENT_TYPE = 'application/vnd.ms-excel';

/**
 * 셀피아 주문 파일 전송(kind `orders.sellpia_order_transfer`, KID-355 wave8b)의 파일 규칙. 파일은 scope에 없다 — 서버가
 * 원천 실행(몰 주문·직배송)에서 옛 변환 라우트와 같은 변환기로 다시 만든다(사장님 Q2). plan은 그 파일의 주문번호를 대상으로
 * 얼리고, 확장이 받는 source 라우트는 같은 plan으로 다시 만들어 번호가 plan과 같을 때만 준다. 보관 캡처는 없다(plan에는 새
 * 실행 id가 없다).
 */
@Injectable()
export class SellpiaOrderTransferService {
  constructor(
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
    private readonly mallOrders: MallOrdersOperationService,
    @Inject(COUPANG_DIRECT_ORDER_COLLECTION_PORT) private readonly directship: CoupangDirectOrderCollectionPort,
    private readonly directshipFiles: CoupangDirectshipService,
  ) {}

  async plan(organizationId: string, rawScope: unknown): Promise<OperationPlanResult> {
    const scope = sellpiaTransferScope(rawScope);
    const source = await this.operations.get(organizationId, scope.sourceOperationId);
    if (!source || source.status !== 'succeeded') {
      throw new KiditemPreconditionError('ORDERS_TRANSFER_SOURCE_UNAVAILABLE', {
        details: { reason: source ? 'source_not_succeeded' : 'source_not_found', sourceOperationId: scope.sourceOperationId },
      });
    }
    const transport = sellpiaTransferTransport(source.kind, scope.transport);
    const file = await this.regenerate(organizationId, scope.sourceOperationId, transport);
    if (!file || file.orderNumbers.length === 0) {
      throw new KiditemPreconditionError('ORDERS_TRANSFER_NO_TARGETS', { details: { sourceOperationId: scope.sourceOperationId } });
    }
    const plan: SellpiaOrderTransferPlan = SellpiaOrderTransferPlanSchema.parse({
      sourceOperationId: scope.sourceOperationId,
      shopName: scope.shopName,
      transport,
      fileName: file.fileName,
      targetOrderNumbers: file.orderNumbers,
    });
    return { lockKeys: [SELLPIA_ACTION_LOCK_KEY], plan };
  }

  /**
   * 진행 중(executing·reconciling)인 전송 실행의 업로드 파일. 다시 만든 파일의 주문번호가 plan 대상과 다르면(원천이 바뀜)
   * 주지 않는다 — 확장이 plan에 없는 주문을 셀피아에 넣지 않게.
   */
  async readSource(organizationId: string, operationId: string): Promise<SellpiaTransferFile> {
    const operation = await this.operations.get(organizationId, operationId);
    if (!operation || operation.kind !== SELLPIA_ORDER_TRANSFER_KIND) {
      throw new KiditemNotFoundError('OPERATION_NOT_FOUND', { details: { reason: 'operation_not_found', operationId } });
    }
    if (operation.status !== 'executing' && operation.status !== 'reconciling') {
      throw new KiditemNotFoundError('OPERATION_NOT_FOUND', { details: { reason: 'operation_not_running', operationId, status: operation.status } });
    }
    const plan = readSellpiaTransferPlan(operation.plan);
    const file = await this.regenerate(organizationId, plan.sourceOperationId, plan.transport);
    if (!file || !sameOrderNumbers(file.orderNumbers, plan.targetOrderNumbers)) {
      throw new KiditemPreconditionError('ORDERS_TRANSFER_SOURCE_UNAVAILABLE', {
        details: { reason: 'source_changed', operationId, sourceOperationId: plan.sourceOperationId },
      });
    }
    return { ...file, fileName: plan.fileName };
  }

  /** 원천 실행 → 셀피아 업로드 파일. 변환할 주문이 없으면 null. */
  private async regenerate(
    organizationId: string,
    sourceOperationId: string,
    transport: SellpiaTransferTransport | null,
  ): Promise<SellpiaTransferFile | null> {
    if (transport === null) {
      const converted = await this.mallOrders.convertOperation({ organizationId, operationId: sourceOperationId });
      if (!converted.conversion) return null;
      return {
        bytes: converted.conversion.buffer,
        fileName: converted.conversion.fileName,
        contentType: converted.mallKey === 'art09' ? 'text/csv;charset=utf-8' : XLS_CONTENT_TYPE,
        orderNumbers: sellpiaOrderNumbersFromFile(converted.conversion.buffer),
      };
    }
    const projection = await this.readDirectshipProjection(organizationId, sourceOperationId, transport);
    if (projection.request.pos.length === 0) return null;
    const generated = await this.directshipFiles.generate(projection.request);
    return {
      bytes: generated.buffer,
      fileName: generated.fileName,
      contentType: XLS_CONTENT_TYPE,
      orderNumbers: sellpiaOrderNumbersFromFile(generated.buffer),
    };
  }

  /** 웹이 변환 때 고른 그 운송유형의 소비 기록. 캡처·소비 기록이 없으면 전송할 원천이 없다. */
  private async readDirectshipProjection(organizationId: string, operationId: string, transport: SellpiaTransferTransport) {
    try {
      return await this.directship.readProjection({ organizationId, operationId, transport });
    } catch (error) {
      if (!(error instanceof KiditemNotFoundError)) throw error;
      throw new KiditemPreconditionError('ORDERS_TRANSFER_SOURCE_UNAVAILABLE', {
        details: { reason: 'directship_not_consumed', sourceKind: COUPANG_DIRECTSHIP_KIND, transport },
        cause: error,
      });
    }
  }
}
