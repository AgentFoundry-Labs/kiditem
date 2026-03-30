import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CsService } from '../services/cs.service';

@Controller('cs')
export class CsController {
  constructor(private readonly csService: CsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('csStatus') csStatus?: string,
  ) {
    return this.csService.findAll({ page, limit, csStatus });
  }

  @Post()
  create(
    @Body()
    body: {
      csType: string;
      content: string;
      priority?: string;
      assignee?: string;
      orderId?: string;
      productId?: string;
    },
  ) {
    return this.csService.create(body);
  }
}
