import { Controller, Get, Query } from '@nestjs/common';
import { ActivityEventsService } from './activity-events.service';
import { ListActivityEventsQueryDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('activity-events')
export class ActivityEventsController {
  constructor(private readonly activityEventsService: ActivityEventsService) {}

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ListActivityEventsQueryDto,
  ) {
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

    return this.activityEventsService.findByCompany(companyId, {
      objectType: query.objectType,
      eventType: query.eventType,
      limit: query.limit,
    });
  }
}
