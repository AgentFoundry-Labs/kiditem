import { Controller, Get, Headers } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { RulesService } from '../services/rules.service';
import { parseRequiredIdempotencyKey } from '../../common/http/required-idempotency-key';

@Controller('rules')
export class RuleSuggestionsController {
  constructor(private readonly rulesService: RulesService) {}

  @Get('suggest-thresholds')
  async suggestThresholds(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.rulesService.suggestThresholds(
      organizationId,
      user.id,
      parseRequiredIdempotencyKey(idempotencyKey),
    );
  }
}
