import { Controller, Get, Query } from '@nestjs/common';
import { UnshippedService } from '../services/unshipped.service';

@Controller('unshipped')
export class UnshippedController {
  constructor(private readonly unshippedService: UnshippedService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('minDays') minDays?: string,
  ) {
    return this.unshippedService.findAll({ page, limit, minDays });
  }
}
