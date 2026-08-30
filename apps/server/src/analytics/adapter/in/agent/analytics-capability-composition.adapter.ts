import { Inject, Injectable } from '@nestjs/common';
import { defineCapabilityComposition } from '../../../../common/capability-composition';
import { ANALYTICS_CAPABILITIES } from '../../../domain/capability/analytics.capabilities';
import {
  ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT,
  type AnalyticsAgentOverviewCapabilityPort,
} from '../../../dashboard/application/port/in/analytics-overview-capability.port';
import type { AnalyticsCapabilityCompositionPort } from '../../../application/port/in/capability/analytics-capability-composition.port';

/** Analytics owns the definition-to-dashboard-owner-port Adapter. */
@Injectable()
export class AnalyticsCapabilityCompositionAdapter
  implements AnalyticsCapabilityCompositionPort
{
  readonly compositions;

  constructor(
    @Inject(ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT)
    private readonly overview: AnalyticsAgentOverviewCapabilityPort,
  ) {
    this.compositions = [
      defineCapabilityComposition(ANALYTICS_CAPABILITIES[0], this.overview, {
        capabilityKey: 'analytics.readOverview',
        ownerInputPort: 'analytics.readOverview',
        invoke: ({ context, input }) =>
          this.overview.readOverview({
            organizationId: context.organizationId,
            ...(input.period ? { period: input.period } : {}),
          }),
      }),
    ];
  }
}
