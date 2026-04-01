import { Controller, Get, Query } from '@nestjs/common';
import { StockMovementService } from '../services/stock-movement.service';
import { ListStockMovementQueryDto, StockMovementSummaryQueryDto } from '../dto';

@Controller('stock-movement')
export class StockMovementController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  @Get()
  findAll(@Query() query: ListStockMovementQueryDto) {
    return this.stockMovementService.findAll(query as any);
  }

  @Get('summary')
  getSummary(@Query() query: StockMovementSummaryQueryDto) {
    return this.stockMovementService.getSummary(query.days!);
  }
}
