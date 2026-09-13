import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertsController } from './alerts.controller';
import { SourceFailureAlerts } from './alerts.service';

@Module({
  imports: [PrismaModule],
  controllers: [AlertsController],
  providers: [SourceFailureAlerts],
  exports: [SourceFailureAlerts],
})
export class AlertsModule {}
