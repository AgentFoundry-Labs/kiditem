import { Controller, Get, Query } from '@nestjs/common';
import { ActivityEventsService } from './activity-events.service';
import { ListActivityEventsQueryDto } from './dto';

@Controller('activity-events')
export class ActivityEventsController {
  constructor(private readonly activityEventsService: ActivityEventsService) {}

  @Get()
  findAll(@Query() query: ListActivityEventsQueryDto) {
    if (query.objectType && query.objectId) {
      return this.activityEventsService.findByObject(
        query.objectType,
        query.objectId,
        {
          eventType: query.eventType,
          limit: query.limit,
        },
      );
    }

    if (query.companyId) {
      return this.activityEventsService.findByCompany(query.companyId, {
        objectType: query.objectType,
        eventType: query.eventType,
        limit: query.limit,
      });
    }

    return [];
  }
}
