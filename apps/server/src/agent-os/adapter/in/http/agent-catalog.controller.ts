import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { AgentCatalogService } from '../../../application/service/agent-catalog.service';
import {
  CreateAgentInstanceDto,
  UpdateAgentInstanceDto,
  UpsertInstanceToolPolicyDto,
} from './dto/agent-catalog.dto';

@Controller('agent-os')
export class AgentCatalogController {
  constructor(private readonly catalog: AgentCatalogService) {}

  @Get('definitions')
  listDefinitions() {
    return this.catalog.listDefinitions();
  }

  @Get('skills')
  listSkills() {
    return { items: this.catalog.listSkills() };
  }

  @Get('instances')
  listInstances(@CurrentOrganization() organizationId: string) {
    return this.catalog.listInstances({ organizationId });
  }

  @Get('roster')
  listRoster(@CurrentOrganization() organizationId: string) {
    return this.catalog.listRoster({ organizationId });
  }

  @Get('instances/:id/tool-policies')
  async listInstanceToolPolicies(
    @CurrentOrganization() organizationId: string,
    @Param('id') agentInstanceId: string,
  ) {
    try {
      const items = await this.catalog.listInstanceToolPolicies({
        organizationId,
        agentInstanceId,
      });
      return { items };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('not found')
      ) {
        throw new NotFoundException('Agent instance not found');
      }
      throw error;
    }
  }

  // Organization-scoped but high-trust mutation: creating an AgentInstance
  // sets adapterType / modelOverride / runtimeConfig / promptPathOverride and
  // implicitly elevates anyone in the org who can call it. Admin/owner only.
  @Roles('admin', 'owner')
  @Post('instances')
  createInstance(
    @CurrentOrganization() organizationId: string,
    @Body() body: CreateAgentInstanceDto,
  ) {
    return this.catalog.createInstance({
      organizationId,
      type: body.type,
      name: body.name,
      role: body.role,
      title: body.title ?? null,
      icon: body.icon ?? null,
      reportsToId: body.reportsToId ?? null,
      trustLevel: body.trustLevel,
      modelOverride: body.modelOverride ?? null,
      adapterConfig: body.adapterConfig,
      runtimeConfig: body.runtimeConfig,
      promptPathOverride: body.promptPathOverride ?? null,
    });
  }

  // Same elevation surface as createInstance — modelOverride, trustLevel,
  // runtimeConfig, promptPathOverride are all admin-tier configuration.
  @Roles('admin', 'owner')
  @Patch('instances/:id')
  async updateInstance(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() body: UpdateAgentInstanceDto,
  ) {
    try {
      return await this.catalog.updateInstance({
        organizationId,
        id,
        ...body,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not_found')) {
        throw new NotFoundException('Agent instance not found');
      }
      throw error;
    }
  }

  // Tool policy widening (deny -> allow / approval_required -> allow) is an
  // admin-tier action audited via AgentAuthorizationEvent.
  @Roles('admin', 'owner')
  @Put('instances/:id/tool-policies/:toolKey')
  async upsertInstanceToolPolicy(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') agentInstanceId: string,
    @Param('toolKey') toolKey: string,
    @Body() body: UpsertInstanceToolPolicyDto,
  ) {
    await this.catalog.upsertInstanceToolPolicy({
      organizationId,
      agentInstanceId,
      toolKey,
      effect: body.effect,
      approvalMode: body.approvalMode,
      dryRunMode: body.dryRunMode,
      constraints: body.constraints,
      actorUserId: user.id,
    });
    return { ok: true };
  }
}
