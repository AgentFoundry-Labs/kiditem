import { Controller, Get, Query } from '@nestjs/common';
import { ProfitLossService } from '../services/profit-loss.service';
import { ProfitLossQueryDto } from '../dto';

@Controller('profit-loss')
export class ProfitLossController {
  constructor(private readonly profitLossService: ProfitLossService) {}

  @Get()
  findAll(@Query() query: ProfitLossQueryDto) {
    return this.profitLossService.findAll(query.period);
  }
}
