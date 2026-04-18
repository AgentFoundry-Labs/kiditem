import { Controller, Get, Post, Body, Param, Query, ServiceUnavailableException } from '@nestjs/common';
import { ReturnsService } from '../services/returns.service';
import { ListReturnsQueryDto, ReturnActionBodyDto } from '../dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  findAll(@CurrentCompany() companyId: string, @Query() query: ListReturnsQueryDto) {
    return this.returnsService.findAll(companyId, query);
  }

  @Get('stats')
  getStats(@CurrentCompany() companyId: string) {
    return this.returnsService.getStats(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.returnsService.findOne(id, companyId);
  }

  @Post()
  async handleAction(@Body() body: ReturnActionBodyDto) {
    try {
      return await this.returnsService.approve(body.receiptId);
    } catch {
      throw new ServiceUnavailableException('쿠팡 API가 연결되지 않았습니다.');
    }
  }
}
