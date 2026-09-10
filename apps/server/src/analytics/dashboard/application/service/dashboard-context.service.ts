import { Injectable } from '@nestjs/common';
import { buildDashboardContext, type DashboardContext } from '../../domain/context';

@Injectable()
export class DashboardContextService {
  async buildForQuery(
    organizationId: string,
    range?: string,
    from?: string,
    to?: string,
  ): Promise<DashboardContext> {
    // The selected period is user input plus the current KST calendar. A
    // source's latest observed date is evidence metadata, never permission
    // to silently move the dashboard onto another month/day.
    void organizationId;
    return buildDashboardContext(range, from, to);
  }

  buildSnapshot(): DashboardContext {
    return buildDashboardContext();
  }
}
