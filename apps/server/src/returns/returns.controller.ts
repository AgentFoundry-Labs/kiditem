import { Controller, Get, Post, Body, Query, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ReturnsService } from './returns.service';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  findAll(@Query() query: { from?: string; to?: string; type?: string }) {
    return this.returnsService.findAll(query);
  }

  @Post()
  async handleAction(@Body() body: { action?: string; receiptId?: number }) {
    if (body.action === 'approve' && body.receiptId) {
      try {
        return await this.returnsService.approve(body.receiptId);
      } catch {
        throw new ServiceUnavailableException('쿠팡 API가 연결되지 않았습니다.');
      }
    }
    throw new BadRequestException('알 수 없는 액션');
  }
}
