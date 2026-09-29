import { Inject, Injectable } from '@nestjs/common';
import { KiditemNotFoundError } from '@kiditem/shared/errors';
import type { OperationView } from '@kiditem/shared/operation';
import {
  MALL_TRACKING_UPLOAD_KIND,
  SELLPIA_AUTO_INVOICE_KIND,
  SELLPIA_ORDER_TRANSFER_KIND,
} from '@kiditem/shared/orders-action-operations';
import { z } from 'zod';
import {
  OPERATION_PORT,
  type OperationPort,
} from '../../../common/operation/application/port/in/operation.port';
import { MallTrackingOperatorConfirmationSchema } from '../../domain/mall-tracking-upload-operation';
import { parseActionInput } from '../../domain/orders-action-operation-input';
import { SellpiaInvoiceOperatorConfirmationSchema } from '../../domain/sellpia-auto-invoice-operation';
import { SellpiaTransferOperatorConfirmationSchema } from '../../domain/sellpia-order-transfer-operation';

export const OrdersActionConfirmRequestSchema = z.object({ result: z.record(z.string(), z.unknown()).optional() }).strict();
export const OrdersActionCloseRequestSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() }).strict();

/**
 * `reconciling`으로 멈추는 Orders 작업 kind(몰·셀피아에 제출했지만 결과를 못 읽음)와, 운영자가 확인할 때 받는 본문·닫을 때
 * 남기는 코드. 전송 close는 미접수(재전송 허용), 나머지는 운영자 닫음.
 */
const RECONCILING_KINDS: Readonly<Record<string, { confirmation: z.ZodTypeAny; closeCode: string }>> = {
  [SELLPIA_ORDER_TRANSFER_KIND]: { confirmation: SellpiaTransferOperatorConfirmationSchema, closeCode: 'SELLPIA_TRANSFER_NOT_SUBMITTED' },
  [SELLPIA_AUTO_INVOICE_KIND]: { confirmation: SellpiaInvoiceOperatorConfirmationSchema, closeCode: 'ORDERS_ACTION_CLOSED_BY_OPERATOR' },
  [MALL_TRACKING_UPLOAD_KIND]: { confirmation: MallTrackingOperatorConfirmationSchema, closeCode: 'ORDERS_ACTION_CLOSED_BY_OPERATOR' },
};

/**
 * Orders 작업 실행의 운영자 확인·닫기(KID-355 wave8b). 채널 등록 실행과 같은 모양이다(`operations.resolve`): confirm은
 * 운영자가 셀피아·몰에서 본 사실을 `operatorConfirmation`으로 실어 owner finalize를 다시 부르고, close는 재시도 없이 실패로
 * 닫는다. 같은 조직의 운영자면 누구나(채널 등록 확인과 같은 가정).
 */
@Injectable()
export class OrdersActionOperationService {
  constructor(@Inject(OPERATION_PORT) private readonly operations: OperationPort) {}

  async confirm(organizationId: string, operationId: string, body: unknown): Promise<OperationView> {
    const request = parseActionInput(OrdersActionConfirmRequestSchema, body, 'invalid_confirm_request');
    const kind = await this.requireReconcilingKind(organizationId, operationId);
    const operatorConfirmation = parseActionInput(kind.confirmation, request.result ?? {}, 'invalid_operator_confirmation');
    const response = await this.operations.resolve({
      organizationId,
      operationId,
      outcome: 'succeeded',
      result: { operatorConfirmation },
    });
    return response.operation;
  }

  async close(organizationId: string, operationId: string, body: unknown): Promise<OperationView> {
    const request = parseActionInput(OrdersActionCloseRequestSchema, body, 'invalid_close_request');
    const kind = await this.requireReconcilingKind(organizationId, operationId);
    const response = await this.operations.resolve({
      organizationId,
      operationId,
      outcome: 'failed',
      errorCode: kind.closeCode,
      errorMessage: request.reason ?? null,
      result: { closedReason: request.reason ?? null },
    });
    return response.operation;
  }

  private async requireReconcilingKind(organizationId: string, operationId: string) {
    const operation = await this.operations.get(organizationId, operationId);
    const kind = operation ? RECONCILING_KINDS[operation.kind] : undefined;
    if (!kind) throw new KiditemNotFoundError('OPERATION_NOT_FOUND', { details: { operationId } });
    return kind;
  }
}
