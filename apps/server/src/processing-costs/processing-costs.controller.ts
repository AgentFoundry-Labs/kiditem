import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { ProcessingCostsService } from './processing-costs.service';
import { ListProcessingCostsQueryDto, CreateProcessingCostDto, UpdateProcessingCostDto } from './dto';

@Controller('processing-costs')
export class ProcessingCostsController {
  constructor(
    private readonly processingCostsService: ProcessingCostsService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async findAll(@Query() query: ListProcessingCostsQueryDto) {
    return this.processingCostsService.findAll(
      await this.companyResolver.resolve(),
      query.status,
    );
  }

  @Get('monthly')
  async monthly(@Query() query: ListProcessingCostsQueryDto) {
    return this.processingCostsService.monthly(
      await this.companyResolver.resolve(),
    );
  }

  @Post()
  create(@Body() dto: CreateProcessingCostDto) {
    return this.processingCostsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProcessingCostDto) {
    return this.processingCostsService.update(id, dto);
  }
}
