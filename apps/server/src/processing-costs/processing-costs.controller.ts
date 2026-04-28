import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { ProcessingCostsService } from './processing-costs.service';
import { ListProcessingCostsQueryDto, CreateProcessingCostDto, UpdateProcessingCostDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('processing-costs')
export class ProcessingCostsController {
  constructor(private readonly processingCostsService: ProcessingCostsService) {}

  @Get()
  async findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ListProcessingCostsQueryDto,
  ) {
    return this.processingCostsService.findAll(companyId, query.status);
  }

  @Get('monthly')
  async monthly(@CurrentCompany() companyId: string) {
    return this.processingCostsService.monthly(companyId);
  }

  @Post()
  create(@Body() dto: CreateProcessingCostDto, @CurrentCompany() companyId: string) {
    return this.processingCostsService.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProcessingCostDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.processingCostsService.update(id, dto, companyId);
  }
}
