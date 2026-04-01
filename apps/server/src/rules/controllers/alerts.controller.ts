import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { AlertsService } from '../services/alerts.service';
import { ListAlertsQueryDto } from '../dto';

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
}
