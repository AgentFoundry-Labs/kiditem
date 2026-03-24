import { Module } from '@nestjs/common';
import { ActivityEventsController } from './activity-events.controller';
import { ActivityEventsService } from './activity-events.service';

@Module({
  controllers: [ActivityEventsController],
  providers: [ActivityEventsService],
  exports: [ActivityEventsService],
})
export class ActivityEventsModule {}
