import { Controller, Get, Post, Body, Param, Query, ServiceUnavailableException } from '@nestjs/common';
import { ReturnsService } from '../services/returns.service';
import { ListReturnsQueryDto, ReturnActionBodyDto } from '../dto';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  findAll(@Query() query: ListReturnsQueryDto) {
    return this.returnsService.findAll(query);
  }

  @Get('stats')
  getStats() {
    return this.returnsService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returnsService.findOne(id);
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
