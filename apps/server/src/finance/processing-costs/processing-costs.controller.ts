import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { ProcessingCostsService } from './processing-costs.service';
import { ListProcessingCostsQueryDto, CreateProcessingCostDto, UpdateProcessingCostDto } from './dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('processing-costs')
export class ProcessingCostsController {
  constructor(private readonly processingCostsService: ProcessingCostsService) {}

  @Get()
  async findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListProcessingCostsQueryDto,
  ) {
    return this.processingCostsService.findAll(organizationId, query.status);
  }

  @Get('monthly')
  async monthly(@CurrentOrganization() organizationId: string) {
    return this.processingCostsService.monthly(organizationId);
  }

  @Post()
  create(@Body() dto: CreateProcessingCostDto, @CurrentOrganization() organizationId: string) {
    return this.processingCostsService.create(organizationId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProcessingCostDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.processingCostsService.update(id, organizationId, dto);
  }
}
