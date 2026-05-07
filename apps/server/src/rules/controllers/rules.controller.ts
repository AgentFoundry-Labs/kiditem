import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RulesService } from '../services/rules.service';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { ListRulesQueryDto, UpdateRuleBodyDto } from '../dto';

@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post('evaluate')
  async evaluate(@CurrentOrganization() organizationId: string) {
    return this.rulesService.evaluateAll(organizationId);
  }

  @Get('evaluate/status/:requestId')
  getEvaluationStatus(
    @CurrentOrganization() organizationId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.rulesService.getEvaluationStatus(organizationId, requestId);
  }

  @Get('summary')
  async summary(@CurrentOrganization() organizationId: string) {
    return this.rulesService.getSummary(organizationId);
  }

  @Get()
  async findAll(@CurrentOrganization() organizationId: string, @Query() query: ListRulesQueryDto) {
    return this.rulesService.findAllRules(organizationId, query.category);
  }

  @Get('suggest-thresholds')
  async suggestThresholds(@CurrentOrganization() organizationId: string) {
    return this.rulesService.suggestThresholds(organizationId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: UpdateRuleBodyDto,
  ) {
    return this.rulesService.updateRule(id, organizationId, body);
  }
}
