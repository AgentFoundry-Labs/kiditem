import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
import { SourceFailureAlerts } from './alerts.service';

/**
 * The public Alert API is intentionally small: list the organization-scoped
 * ledger and dismiss one open occurrence. Source owners use the service's
 * transaction seam, not HTTP, for terminal mutations.
 */
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: SourceFailureAlerts) {}

  @Get()
  findAll(@CurrentOrganization() organizationId: string) {
    return this.alerts.list(organizationId);
  }

  @Post(':id/dismiss')
  async dismiss(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ): Promise<{ ok: true }> {
    await this.alerts.dismiss(id, organizationId);
    return { ok: true };
  }
}
