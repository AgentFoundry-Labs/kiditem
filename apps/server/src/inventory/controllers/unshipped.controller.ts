import { Controller, Get, Query } from '@nestjs/common';
import { UnshippedService } from '../services/unshipped.service';
import { ListUnshippedQueryDto } from '../dto';

@Controller('unshipped')
export class UnshippedController {
  constructor(private readonly unshippedService: UnshippedService) {}

  @Get()
  findAll(@Query() query: ListUnshippedQueryDto) {
    return this.unshippedService.findAll(query as any);
  }
}
