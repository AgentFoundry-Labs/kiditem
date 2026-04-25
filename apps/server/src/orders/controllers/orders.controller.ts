import { Controller, Get, Post, Body, Param, Query, ServiceUnavailableException, BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from '../services/orders.service';
import { ListOrdersQueryDto, OrderActionBodyDto } from '../dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@CurrentCompany() companyId: string, @Query() query: ListOrdersQueryDto) {
    return this.ordersService.findAll(companyId, query);
  }

  @Get('stats')
  getStats(@CurrentCompany() companyId: string) {
    return this.ordersService.getStats(companyId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    // 서비스가 NotFoundException 을 throw 한다 (null 반환 금지 — apps/server/CLAUDE.md 규칙)
    return this.ordersService.findOne(id, companyId);
  }

  @Post()
  async handleAction(
    @Body() body: OrderActionBodyDto,
    @CurrentCompany() companyId: string,
  ) {
    if (body.action === 'confirm') {
      try {
        return await this.ordersService.confirm(body.shipmentBoxIds!, companyId);
      } catch (err) {
        // 소유권 검증 실패 (NotFoundException) 는 그대로 통과 — 외부 API 다운으로 위장 금지.
        if (err instanceof NotFoundException) throw err;
        throw new ServiceUnavailableException('쿠팡 API가 연결되지 않았습니다.');
      }
    }

    if (body.action === 'invoice') {
      try {
        return await this.ordersService.uploadInvoice(
          body.shipmentBoxId!,
          body.deliveryCompanyCode!,
          body.invoiceNumber!,
          companyId,
        );
      } catch (err) {
        if (err instanceof NotFoundException) throw err;
        throw new ServiceUnavailableException('쿠팡 API가 연결되지 않았습니다.');
      }
    }
    throw new BadRequestException(`Unknown action: ${body.action}`);
  }
}
