import { Controller, Get, Post, Body, Query, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query() query: { from?: string; to?: string; status?: string }) {
    return this.ordersService.findAll(query);
  }

  @Post()
  async handleAction(@Body() body: { action?: string; shipmentBoxIds?: number[]; shipmentBoxId?: number; deliveryCompanyCode?: string; invoiceNumber?: string }) {
    if (body.action === 'confirm') {
      if (!body.shipmentBoxIds?.length) {
        throw new BadRequestException('승인할 주문을 선택하세요.');
      }
      try {
        return await this.ordersService.confirm(body.shipmentBoxIds);
      } catch {
        throw new ServiceUnavailableException('쿠팡 API가 연결되지 않았습니다.');
      }
    }

    if (body.action === 'invoice') {
      if (!body.shipmentBoxId || !body.deliveryCompanyCode || !body.invoiceNumber) {
        throw new BadRequestException('배송정보를 모두 입력하세요.');
      }
      try {
        return await this.ordersService.uploadInvoice(body.shipmentBoxId, body.deliveryCompanyCode, body.invoiceNumber);
      } catch {
        throw new ServiceUnavailableException('쿠팡 API가 연결되지 않았습니다.');
      }
    }

    throw new BadRequestException('알 수 없는 액션');
  }
}
