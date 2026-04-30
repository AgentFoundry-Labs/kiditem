import { Controller, Get, Patch, Post, Param, Query, Body } from '@nestjs/common';
import { AlertsService } from '../../../application/service/alerts.service';
import { ListAlertsQueryDto, PromoteAlertDto } from './dto/alerts';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(@Query() query: ListAlertsQueryDto, @CurrentCompany() companyId: string) {
    return this.alertsService.findAll(companyId, query.limit);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentCompany() companyId: string) {
    return this.alertsService.markAllAsRead(companyId);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.alertsService.markAsRead(id, companyId);
  }

  @Post(':id/promote')
  promote(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PromoteAlertDto,
  ) {
    return this.alertsService.promote(
      id,
      companyId,
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
    @CurrentCompany() companyId: string,
  ) {
    await this.alertsService.dismiss(id, companyId);
    return { ok: true };
  }
}
