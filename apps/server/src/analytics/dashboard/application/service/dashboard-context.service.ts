import { Inject, Injectable } from '@nestjs/common';
import { buildDashboardContext, type DashboardContext } from '../../domain/context';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type WingTrafficAggregationRepositoryPort,
} from '../port/out/repository/wing-traffic-aggregation.repository.port';

@Injectable()
export class DashboardContextService {
  constructor(
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
  ) {}

  async buildForQuery(
    organizationId: string,
    range?: string,
    from?: string,
    to?: string,
  ): Promise<DashboardContext> {
    const anchor = await this.resolveAnchor(organizationId, range, from, to);
    return buildDashboardContext(range, from, to, anchor);
  }

  buildSnapshot(): DashboardContext {
    return buildDashboardContext();
  }

  /**
   * Shift the default month dashboard onto the latest Drive replay business
   * date when the live calendar month has no local order/listing data.
   */
  private async resolveAnchor(
    organizationId: string,
    range: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ): Promise<Date | undefined> {
    if (range && range !== 'month') return undefined;
    if (from || to) return undefined;

    const latest = await this.wingTrafficRepository.findLatestDataDate(organizationId);
    if (!latest) return undefined;

    const now = new Date();
    if (
      latest.getUTCFullYear() === now.getFullYear() &&
      latest.getUTCMonth() === now.getMonth()
    ) {
      return undefined;
    }

    // Noon UTC keeps KST/UTC month math on the latest business date.
    return new Date(
      Date.UTC(
        latest.getUTCFullYear(),
        latest.getUTCMonth(),
        latest.getUTCDate(),
        12,
        0,
        0,
      ),
    );
  }
}
