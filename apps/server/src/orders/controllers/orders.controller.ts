import { Controller, Get, Post, Body, Param, Query, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { OrdersService } from '../services/orders.service';
import { ListOrdersQueryDto, OrderActionBodyDto } from '../dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get('stats')
  getStats() {
    return this.ordersService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  async handleAction(@Body() body: OrderActionBodyDto) {
    if (body.action === 'confirm') {
      try {
        return await this.ordersService.confirm(body.shipmentBoxIds!);
      } catch {
        throw new ServiceUnavailableException('쿠팡 API가 연결되지 않았습니다.');
      }
    }

    if (body.action === 'invoice') {
      try {
        return await this.ordersService.uploadInvoice(body.shipmentBoxId!, body.deliveryCompanyCode!, body.invoiceNumber!);
      } catch {
        throw new ServiceUnavailableException('쿠팡 API가 연결되지 않았습니다.');
      }
    }
    throw new BadRequestException(`Unknown action: ${body.action}`);
  }
}
