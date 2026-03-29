import { Controller, Get, Query } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';

@Controller('stock-movement')
export class StockMovementController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.stockMovementService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      type,
      from,
      groupBy,
    });
  }

  @Get('summary')
  getSummary(@Query('days') days?: string) {
    return this.stockMovementService.getSummary(
      days ? parseInt(days, 10) : 30,
    );
  }
}
