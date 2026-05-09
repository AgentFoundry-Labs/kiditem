import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { ListSettlementsQueryDto, CreateSettlementDto, UpdateSettlementDto, ReconcileSettlementDto } from './dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';

@Controller('settlements')
export class SettlementsController {
  constructor(
    private readonly settlementsService: SettlementsService,
  ) {}

  @Get()
  async findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListSettlementsQueryDto,
  ) {
    return this.settlementsService.findAll(organizationId, query.period);
  }

  @Post()
  create(@Body() dto: CreateSettlementDto, @CurrentOrganization() organizationId: string) {
    return this.settlementsService.create(organizationId, dto);
  }

  @Post('reconcile')
  async reconcile(
    @Body() dto: ReconcileSettlementDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settlementsService.reconcile(organizationId, dto.period, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @Body() dto: UpdateSettlementDto,
  ) {
    return this.settlementsService.update(id, organizationId, dto);
  }
}
