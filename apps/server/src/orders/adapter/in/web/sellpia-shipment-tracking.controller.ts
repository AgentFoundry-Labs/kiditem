import { Controller, Get, Inject, Param, ParseUUIDPipe, Res, StreamableFile } from '@nestjs/common';
import { SELLPIA_SHIPMENT_TRACKING_KIND } from '@kiditem/shared/orders-operations';
import type { Response } from 'express';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  ORDER_OPERATION_CAPTURE_PORT,
  type OrderOperationCapturePort,
} from '../../../application/port/in/order-operation-capture.port';

/**
 * 셀피아 송장 조회의 보관 캡처 내려받기. 조회 시작·진행·중단은 실행 계약(`/api/operations`, kind
 * `orders.sellpia_shipment_tracking`)이 맡고, 여기는 성공한 실행의 캡처만 준다(KID-359 H3).
 */
@Controller('orders/sellpia-shipment-tracking')
export class SellpiaShipmentTrackingController {
  constructor(@Inject(ORDER_OPERATION_CAPTURE_PORT) private readonly captures: OrderOperationCapturePort) {}

  @Get(':operationId/source')
  async readSource(
    @CurrentOrganization() organizationId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { capture } = await this.captures.readSucceeded({ organizationId, operationId, kind: SELLPIA_SHIPMENT_TRACKING_KIND });
    if (capture.fileName) {
      const asciiFallback = capture.fileName.replace(/[^\x20-\x7E]/g, '_');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(capture.fileName)}`,
      );
    }
    response.setHeader('Content-Type', capture.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(capture.bytes);
  }
}
