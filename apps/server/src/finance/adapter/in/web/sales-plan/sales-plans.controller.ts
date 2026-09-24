import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { SalesPlansService } from '../../../../application/service/sales-plan/sales-plans.service';
import { CreateSalesPlanDto, UpdateSalesPlanDto } from './dto';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';

/** Every plan view reads actuals over the KST days closed at the request's instant. */
@Controller('sales-plans')
export class SalesPlansController {
  constructor(private readonly salesPlansService: SalesPlansService) {}

  @Get()
  async findAll(@CurrentOrganization() organizationId: string) {
    return this.salesPlansService.findAll(organizationId, new Date());
  }

  @Post()
  create(@Body() dto: CreateSalesPlanDto, @CurrentOrganization() organizationId: string) {
    return this.salesPlansService.create(organizationId, dto, new Date());
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @Body() dto: UpdateSalesPlanDto,
  ) {
    return this.salesPlansService.update(id, organizationId, dto, new Date());
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.salesPlansService.delete(id, organizationId);
  }
}
