import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { RulesService } from '../services/rules.service';

@Controller('rules')
export class RuleEvaluationController {
  constructor(private readonly rulesService: RulesService) {}

  @Post('evaluate')
  async evaluate(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rulesService.evaluateAll(organizationId, user.id);
  }

  @Get('evaluate/status/:requestId')
  getEvaluationStatus(
    @CurrentOrganization() organizationId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.rulesService.getEvaluationStatus(organizationId, requestId);
  }
}
