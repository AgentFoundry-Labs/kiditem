import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, StreamableFile } from '@nestjs/common';
import type { OperationFinishResponse } from '@kiditem/shared/operation';
import type { Response } from 'express';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { OrdersActionOperationService } from '../../../application/service/orders-action-operation.service';
import { SellpiaOrderTransferService } from '../../../application/service/sellpia-order-transfer.service';
import { contentDispositionAttachment } from './operation-conversion';

/**
 * Orders 작업 실행(KID-355 wave8b)의 owner 라우트. 시작·진행·읽기는 실행 계약(`/api/operations`)이 맡고, 여기는
 * 전송 파일 내려받기와 `reconciling` 실행의 운영자 확인·닫기만 한다.
 */
@Controller('orders/action-operations')
export class OrdersActionOperationsController {
  constructor(
    private readonly transfers: SellpiaOrderTransferService,
    private readonly actions: OrdersActionOperationService,
  ) {}

  /** 진행 중인 셀피아 전송 실행의 업로드 파일(원천 실행에서 다시 만든 것, 이름은 plan.fileName). */
  @Get(':operationId/source')
  async readSource(
    @CurrentOrganization() organizationId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.transfers.readSource(organizationId, operationId);
    response.setHeader('Content-Disposition', contentDispositionAttachment(file.fileName));
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.bytes);
  }

  /** 운영자가 셀피아·몰에서 처리된 것을 봤다 → `succeeded`(owner finalize가 확인 본문으로 result를 만든다). */
  @Post(':operationId/confirm')
  async confirm(
    @CurrentOrganization() organizationId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Body() body: unknown,
  ): Promise<OperationFinishResponse> {
    return { operation: await this.actions.confirm(organizationId, operationId, body ?? {}) };
  }

  /** 처리되지 않았다 → `failed`(재시도 없음). */
  @Post(':operationId/close')
  async close(
    @CurrentOrganization() organizationId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Body() body: unknown,
  ): Promise<OperationFinishResponse> {
    return { operation: await this.actions.close(organizationId, operationId, body ?? {}) };
  }
}
