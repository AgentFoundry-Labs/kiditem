import { Controller, Get, Patch, Post, Param, Query, Body } from '@nestjs/common';
import { AlertsService } from '../services/alerts.service';
import { ListAlertsQueryDto, PromoteAlertDto } from '../dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(@Query() query: ListAlertsQueryDto) {
    return this.alertsService.findAll(query.limit);
  }

  @Patch('read-all')
  markAllAsRead() {
    return this.alertsService.markAllAsRead();
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.alertsService.markAsRead(id);
  }

  @Post(':id/promote')
  promote(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PromoteAlertDto,
  ) {
    return this.alertsService.promote(id, companyId, dto, user.id);
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
