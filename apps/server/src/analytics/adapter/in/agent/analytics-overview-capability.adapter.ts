import { Inject, Injectable } from '@nestjs/common';
import {
  ANALYTICS_OVERVIEW_CAPABILITY_PORT,
  type AnalyticsAgentOverviewCapabilityPort,
  type AnalyticsOverviewCapabilityPort,
} from '../../../dashboard/application/port/in/analytics-overview-capability.port';

/** Analytics owns the public read capability; callers never reach dashboard services. */
@Injectable()
export class AnalyticsOwnerOverviewCapabilityAdapter
  implements AnalyticsAgentOverviewCapabilityPort
{
  constructor(
    @Inject(ANALYTICS_OVERVIEW_CAPABILITY_PORT)
    private readonly overview: AnalyticsOverviewCapabilityPort,
  ) {}

  readOverview(input: { organizationId: string; period?: 'today' | 'month' }) {
    return this.overview.readOverview({ ...input, now: new Date() });
  }
}
