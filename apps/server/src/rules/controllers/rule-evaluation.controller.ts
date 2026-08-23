import { Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { RulesService } from '../services/rules.service';
import { parseRequiredIdempotencyKey } from '../../common/http/required-idempotency-key';

@Controller('rules')
export class RuleEvaluationController {
  constructor(private readonly rulesService: RulesService) {}

  @Post('evaluate')
  async evaluate(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.rulesService.evaluateAll(
      organizationId,
      user.id,
      parseRequiredIdempotencyKey(idempotencyKey),
    );
  }

  @Get('evaluate/status/:requestId')
  getEvaluationStatus(
    @CurrentOrganization() organizationId: string,
    @Param('requestId') operationId: string,
  ) {
    return this.rulesService.getEvaluationStatus(organizationId, operationId);
  }
}
