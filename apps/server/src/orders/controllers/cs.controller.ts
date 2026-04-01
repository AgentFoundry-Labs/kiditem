import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CsService } from '../services/cs.service';
import { ListCsQueryDto, CreateCsBodyDto } from '../dto';

@Controller('cs')
export class CsController {
  constructor(private readonly csService: CsService) {}

  @Get()
  findAll(@Query() query: ListCsQueryDto) {
    return this.csService.findAll(query as any);
  }

  @Post()
  create(@Body() body: CreateCsBodyDto) {
    return this.csService.create(body);
  }
}
