import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { ListRulesQueryDto, UpdateRuleBodyDto } from '../dto';
import { RulesService } from '../services/rules.service';

@Controller('rules')
export class RulesManagementController {
  constructor(private readonly rulesService: RulesService) {}

  @Get('summary')
  async summary(@CurrentOrganization() organizationId: string) {
    return this.rulesService.getSummary(organizationId);
  }

  @Get()
  async findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListRulesQueryDto,
  ) {
    return this.rulesService.findAllRules(organizationId, query.category);
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
