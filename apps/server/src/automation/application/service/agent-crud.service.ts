import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AgentListItem } from '@kiditem/shared/agent';
import { PrismaService } from '../../../prisma/prisma.service';
import { HeartbeatService } from '../../../agent-registry/heartbeat/heartbeat.service';
import { validateAllowedTools } from '../../../agent-registry/safety/dangerous-patterns';
import type { OrgNode } from '../../../agent-registry/types';
import {
  type AgentDefinitionUpdateData,
  tenantOwnedFilter,
  tenantScopeFilter,
} from './agent-registry.types';

@Injectable()
export class AgentCrudService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => HeartbeatService))
    private readonly heartbeat: HeartbeatService,
  ) {}

  async findByType(type: string) {
    const def = await this.prisma.agentDefinition.findUnique({
      where: { type },
    });
    if (!def) throw new NotFoundException(`Agent definition with type '${type}' not found`);
    return def;
  }

  async list(companyId: string, query: { isActive?: string } = {}): Promise<AgentListItem[]> {
    const items = await this.prisma.agentDefinition.findMany({
      where: {
        companyId,
        ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
      },
      omit: { promptTemplate: true },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((a) => ({
      ...a,
      adapterConfig: (a.adapterConfig ?? {}) as Record<string, unknown>,
      runtimeConfig: (a.runtimeConfig ?? {}) as Record<string, unknown>,
      permissions: (a.permissions ?? {}) as Record<string, unknown>,
      actionCap: (a.actionCap ?? {}) as Record<string, unknown>,
      metadata: a.metadata as Record<string, unknown> | null,
    }) satisfies AgentListItem);
  }

  async getById(id: string, companyId?: string) {
    const def = companyId
      ? await this.prisma.agentDefinition.findFirst({
          where: { id, ...tenantScopeFilter(companyId) },
        })
      : await this.prisma.agentDefinition.findFirst({ where: { id } });
    if (!def) throw new NotFoundException(`Agent definition ${id} not found`);

    if (companyId && def.companyId && def.companyId !== companyId) {
      throw new ForbiddenException('Access denied to this agent');
    }

    return def;
  }

  async create(data: {
    companyId: string;
    name: string;
    type: string;
    description?: string;
    promptTemplate: string;
    allowedTools?: string;
    permissionMode?: string;
    monthlyTokenBudget?: number;
    schedule?: string;
    timeoutSeconds?: number;
    requiresApproval?: boolean;
    adapterType?: string;
    adapterConfig?: Record<string, unknown>;
    role?: string;
    title?: string;
    skills?: string[];
    permissions?: Record<string, unknown>;
    runtimeConfig?: Record<string, unknown>;
  }) {
    if (data.allowedTools) {
      const toolCheck = validateAllowedTools(data.allowedTools);
      if (!toolCheck.valid) {
        throw new BadRequestException(`Blocked tool patterns: ${toolCheck.blocked.join(', ')}`);
      }
    }

    const created = await this.prisma.agentDefinition.create({
      data: {
        ...data,
        adapterConfig: data.adapterConfig as Prisma.InputJsonValue | undefined,
        permissions: data.permissions as Prisma.InputJsonValue | undefined,
        runtimeConfig: data.runtimeConfig as Prisma.InputJsonValue | undefined,
      },
    });
    await this.heartbeat.syncTimers();
    return created;
  }

  async update(id: string, companyId: string, data: AgentDefinitionUpdateData) {
    if (typeof data.allowedTools === 'string') {
      const toolCheck = validateAllowedTools(data.allowedTools);
      if (!toolCheck.valid) {
        throw new BadRequestException(`Blocked tool patterns: ${toolCheck.blocked.join(', ')}`);
      }
    }

    const updateData: Prisma.AgentDefinitionUpdateManyMutationInput = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.promptTemplate !== undefined && { promptTemplate: data.promptTemplate }),
      ...(data.allowedTools !== undefined && { allowedTools: data.allowedTools }),
      ...(data.permissionMode !== undefined && { permissionMode: data.permissionMode }),
      ...(data.monthlyTokenBudget !== undefined && { monthlyTokenBudget: data.monthlyTokenBudget }),
      ...(data.schedule !== undefined && { schedule: data.schedule }),
      ...(data.timeoutSeconds !== undefined && { timeoutSeconds: data.timeoutSeconds }),
      ...(data.requiresApproval !== undefined && { requiresApproval: data.requiresApproval }),
      ...(data.trustLevel !== undefined && { trustLevel: data.trustLevel }),
    };

    const result = await this.prisma.agentDefinition.updateMany({
      where: { id, ...tenantOwnedFilter(companyId) },
      data: updateData,
    });
    if (result.count === 0) throw new NotFoundException(`Agent definition ${id} not found`);

    const updated = await this.prisma.agentDefinition.findFirstOrThrow({
      where: { id, ...tenantOwnedFilter(companyId) },
    });
    await this.heartbeat.syncTimers();
    return updated;
  }

  async delete(id: string, companyId: string): Promise<{ ok: boolean }> {
    const result = await this.prisma.agentDefinition.deleteMany({
      where: { id, ...tenantOwnedFilter(companyId) },
    });
    if (result.count === 0) throw new NotFoundException(`Agent definition ${id} not found`);
    await this.heartbeat.syncTimers();
    return { ok: true };
  }

  async getOrgTree(companyId: string): Promise<OrgNode[]> {
    const catalog = await this.prisma.marketplace.findMany({
      where: { type: 'agent', isPublished: true, adapterType: 'claude_local' },
      orderBy: { name: 'asc' },
    });

    const hired = await this.prisma.agentDefinition.findMany({
      where: { companyId, adapterType: 'claude_local', isActive: true },
    });
    const hiredByMarketplaceId = new Map(
      hired.filter((h) => h.marketplaceId).map((h) => [h.marketplaceId!, h]),
    );

    const managerCatalog = catalog.find((c) => c.role === 'manager');
    const specialistCatalog = catalog.filter((c) => c.role !== 'manager');

    const toNode = (c: typeof catalog[number]): OrgNode => {
      const agent = hiredByMarketplaceId.get(c.id);
      return {
        id: agent?.id ?? c.id,
        name: c.name,
        type: agent?.type ?? c.role ?? 'specialist',
        role: c.role ?? 'specialist',
        title: agent?.title ?? c.name,
        status: agent?.status ?? 'not_hired',
        adapterType: c.adapterType ?? 'claude_local',
        lastHeartbeatAt: agent?.lastHeartbeatAt?.toISOString() ?? null,
        hired: !!agent,
        marketplaceId: c.id,
        reports: [],
      };
    };

    if (!managerCatalog) return specialistCatalog.map(toNode);

    const managerNode = toNode(managerCatalog);
    managerNode.reports = specialistCatalog.map(toNode);
    return [managerNode];
  }
}
