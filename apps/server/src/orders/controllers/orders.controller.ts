import { Controller, Get, Post, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { OrdersService } from '../services/orders.service';
import { ListOrdersQueryDto, OrderActionBodyDto } from '../dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@CurrentOrganization() organizationId: string, @Query() query: ListOrdersQueryDto) {
    return this.ordersService.findAll(organizationId, query);
  }

  @Get('stats')
  getStats(@CurrentOrganization() organizationId: string) {
    return this.ordersService.getStats(organizationId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    // 서비스가 NotFoundException 을 throw 한다 (null 반환 금지 — apps/server/AGENTS.md 규칙)
    return this.ordersService.findOne(id, organizationId);
  }

  @Post()
  async handleAction(
    @Body() body: OrderActionBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    if (body.action === 'confirm') {
      return this.ordersService.confirm(body.shipmentBoxIds!, organizationId);
    }

    if (body.action === 'invoice') {
      return this.ordersService.uploadInvoice(
        body.shipmentBoxId!,
        body.deliveryCompanyCode!,
        body.invoiceNumber!,
        organizationId,
      );
    }
    throw new BadRequestException(`Unknown action: ${body.action}`);
  }
}
