import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertsController } from './alerts.controller';
import { AlertsRepository } from './alerts.repository';
import { SourceFailureAlerts } from './alerts.service';

@Module({
  imports: [PrismaModule],
  controllers: [AlertsController],
  providers: [AlertsRepository, SourceFailureAlerts],
  exports: [SourceFailureAlerts],
})
export class AlertsModule {}
