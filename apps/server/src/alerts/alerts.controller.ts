import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(@Query('limit') limit?: string) {
    return this.alertsService.findAll(limit ? parseInt(limit, 10) : undefined);
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
