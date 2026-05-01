import { Controller, Get, Patch, Post, Param, Query, Body } from '@nestjs/common';
import { AlertsService } from '../../../application/service/alerts.service';
import { ListAlertsQueryDto, PromoteAlertDto } from './dto/alerts';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(@Query() query: ListAlertsQueryDto, @CurrentOrganization() organizationId: string) {
    return this.alertsService.findAll(organizationId, query.limit);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentOrganization() organizationId: string) {
    return this.alertsService.markAllAsRead(organizationId);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.alertsService.markAsRead(id, organizationId);
  }

  @Post(':id/promote')
  promote(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PromoteAlertDto,
  ) {
    return this.alertsService.promote(
      id,
      organizationId,
      {
        priorityOverride: dto.priorityOverride,
        roleOverride: dto.roleOverride,
        note: dto.note,
      },
      user.id,
    );
  }

  @Post(':id/dismiss')
  async dismiss(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    await this.alertsService.dismiss(id, organizationId);
    return { ok: true };
  }
}
