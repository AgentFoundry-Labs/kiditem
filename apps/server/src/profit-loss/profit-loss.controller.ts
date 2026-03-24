import { Controller, Get, Query } from '@nestjs/common';
import { ProfitLossService } from './profit-loss.service';

@Controller('profit-loss')
export class ProfitLossController {
  constructor(private readonly profitLossService: ProfitLossService) {}

  @Get()
  findAll(@Query('period') period?: string) {
    return this.profitLossService.findAll(period);
  }
}
