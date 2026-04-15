import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CsService } from '../services/cs.service';
import { ListCsQueryDto, CreateCsBodyDto } from '../dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('cs')
export class CsController {
  constructor(private readonly csService: CsService) {}

  @Get()
  findAll(@Query() query: ListCsQueryDto, @CurrentCompany() companyId: string) {
    return this.csService.findAll(query, companyId);
  }

  @Post()
  create(@Body() body: CreateCsBodyDto, @CurrentCompany() companyId: string) {
    return this.csService.create(body, companyId);
  }
}
