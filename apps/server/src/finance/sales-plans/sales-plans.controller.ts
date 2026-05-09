import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { SalesPlansService } from './sales-plans.service';
import { CreateSalesPlanDto, UpdateSalesPlanDto } from './dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';

@Controller('sales-plans')
export class SalesPlansController {
  constructor(private readonly salesPlansService: SalesPlansService) {}

  @Get()
  async findAll(@CurrentOrganization() organizationId: string) {
    return this.salesPlansService.findAll(organizationId);
  }

  @Post()
  create(@Body() dto: CreateSalesPlanDto, @CurrentOrganization() organizationId: string) {
    return this.salesPlansService.create(organizationId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @Body() dto: UpdateSalesPlanDto,
  ) {
    return this.salesPlansService.update(id, organizationId, dto);
  }

  @Patch(':id/sync')
  syncActuals(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesPlansService.syncActuals(id, organizationId, user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.salesPlansService.delete(id, organizationId);
  }
}
