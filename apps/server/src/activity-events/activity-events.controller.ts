import { Controller, Get, Query } from '@nestjs/common';
import { ActivityEventsService } from './activity-events.service';

@Controller('activity-events')
export class ActivityEventsController {
  constructor(private readonly activityEventsService: ActivityEventsService) {}

  @Get()
  findAll(
    @Query()
    query: {
      objectType?: string;
      objectId?: string;
      companyId?: string;
      eventType?: string;
      limit?: string;
    },
  ) {
    if (query.objectType && query.objectId) {
      return this.activityEventsService.findByObject(
        query.objectType,
        query.objectId,
        {
          eventType: query.eventType,
          limit: query.limit ? parseInt(query.limit) : undefined,
        },
      );
    }

    if (query.companyId) {
      return this.activityEventsService.findByCompany(query.companyId, {
        objectType: query.objectType,
        eventType: query.eventType,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    }

    return [];
  }
}
