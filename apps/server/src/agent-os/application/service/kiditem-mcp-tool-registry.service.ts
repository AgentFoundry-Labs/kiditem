import { Injectable } from '@nestjs/common';
import { findAgentDefinitionByType } from '../../domain/agent-definition.registry';
import type { AgentCapabilityHandler } from '../port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';

export const DEFAULT_KIDITEM_MCP_CAPABILITY_ALLOWLIST = [
  'market.collect_shadow_signals',
  'market.collect_keyword_category_rankings',
  'coupang.match_products',
  'coupang.collect_tracking_snapshot',
  'supplier1688.match_products',
  'sourcing.score_opportunities',
  'sourcing.create_recommendation_packet',
  'sourcing.scrapeProductUrl',
  'sourcing.scrapeUrlWorkflow',
  'product_listing.create_generation_package',
  'product_listing.submit_wing_thumbnail',
  'supply.create_purchase_order_draft',
  'supply.submit_purchase_order',
  'channels.register_confirmed_listing',
  'channels.submit_coupang_listing',
] as const;

const FORBIDDEN_MCP_TOOL_KEYS = new Set([
  'delegate_task',
  'memory.search',
  'session_search',
  'todo',
  'browser_navigate',
  'terminal.exec',
  'shell.exec',
  'file.read',
  'file.write',
  'patch.apply',
]);

export const COMMON_AGENT_OS_MCP_TOOLS = [
  'agent_os_read_context',
  'agent_os_read_task_graph',
  'agent_os_read_artifacts',
  'agent_os_finalize_task',
] as const;

export const OPERATOR_AGENT_OS_MCP_TOOLS = [
  'agent_os_list_agents',
  'agent_os_create_task',
  'agent_os_request_user_input',
] as const;

const FIRST_CLASS_CAPABILITY_TOOL_NAMES: Record<string, string> = {
  'market.collect_shadow_signals': 'market_collect_shadow_signals',
  'market.collect_keyword_category_rankings':
    'market_collect_keyword_category_rankings',
  'coupang.match_products': 'coupang_match_products',
  'coupang.collect_tracking_snapshot': 'coupang_collect_tracking_snapshot',
  'supplier1688.match_products': 'supplier1688_match_products',
  'sourcing.score_opportunities': 'sourcing_score_opportunities',
  'sourcing.create_recommendation_packet':
    'sourcing_create_recommendation_packet',
  'sourcing.scrapeProductUrl': 'sourcing_scrape_url',
  'sourcing.scrapeUrlWorkflow': 'sourcing_scrape_url_workflow',
  'product_listing.create_generation_package':
    'listing_create_generation_package',
  'product_listing.submit_wing_thumbnail': 'listing_submit_wing_thumbnail',
  'supply.create_purchase_order_draft': 'order_create_purchase_order_draft',
  'supply.submit_purchase_order': 'order_submit_purchase_order',
  'channels.register_confirmed_listing': 'channel_register_confirmed_listing',
  'channels.submit_coupang_listing': 'channel_submit_coupang_listing',
};

export interface KidItemMcpToolContext {
  agentType: string;
}

export interface KidItemMcpToolDescriptor {
  name: string;
  capabilityKey: string | null;
  ownerDomain: string;
  approvalRisk: AgentCapabilityHandler['approvalRisk'];
  sideEffects: AgentCapabilityHandler['sideEffects'];
  toolKind?: 'common' | 'operator' | 'domain' | 'debug';
}

export type ResolvedKidItemMcpToolDescriptor = KidItemMcpToolDescriptor & {
  capabilityKey: string;
};

export interface ResolvedKidItemMcpTool {
  descriptor: ResolvedKidItemMcpToolDescriptor;
  handler: AgentCapabilityHandler;
}

export function mcpToolNameForCapability(capabilityKey: string): string {
  return `kiditem__${capabilityKey.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

export function firstClassMcpToolNameForCapability(capabilityKey: string): string {
  return (
    FIRST_CLASS_CAPABILITY_TOOL_NAMES[capabilityKey] ??
    capabilityKey.replace(/[^a-zA-Z0-9]+/g, '_')
  );
}

export function modelFacingMcpToolNamesForAgentType(agentType: string): string[] {
  const definition = findAgentDefinitionByType(agentType);
  const common = [...COMMON_AGENT_OS_MCP_TOOLS];
  if (definition?.delegationRole === 'orchestrator') {
    return [...common, ...OPERATOR_AGENT_OS_MCP_TOOLS];
  }
  if (!definition) return common;

  return [
    ...common,
    ...definition.defaultToolPolicies
      .filter((policy) => policy.effect !== 'deny')
      .map((policy) => firstClassMcpToolNameForCapability(policy.toolKey)),
  ];
}

@Injectable()
export class KidItemMcpToolRegistry {
  private readonly allowlist = new Set<string>(
    DEFAULT_KIDITEM_MCP_CAPABILITY_ALLOWLIST,
  );

  constructor(private readonly capabilities: AgentCapabilityRegistry) {}

  listTools(): KidItemMcpToolDescriptor[] {
    return this.capabilities
      .list()
      .filter((handler) => this.isExposed(handler.key))
      .map((handler) => this.toDescriptor(handler, 'debug'));
  }

  listToolsForContext(
    context: KidItemMcpToolContext,
  ): KidItemMcpToolDescriptor[] {
    const common = COMMON_AGENT_OS_MCP_TOOLS.map((name) =>
      this.toControlDescriptor(name, 'common'),
    );
    const definition = findAgentDefinitionByType(context.agentType);
    if (definition?.delegationRole === 'orchestrator') {
      return [
        ...common,
        ...OPERATOR_AGENT_OS_MCP_TOOLS.map((name) =>
          this.toControlDescriptor(name, 'operator'),
        ),
      ];
    }

    if (!definition) return common;

    const allowedCapabilityKeys = new Set(
      definition.defaultToolPolicies
        .filter((policy) => policy.effect !== 'deny')
        .map((policy) => policy.toolKey),
    );
    const domainTools = this.capabilities
      .list()
      .filter(
        (handler) =>
          this.isExposed(handler.key) && allowedCapabilityKeys.has(handler.key),
      )
      .map((handler) => this.toFirstClassDescriptor(handler));

    return [...common, ...domainTools];
  }

  resolveTool(
    name: string,
    context?: KidItemMcpToolContext,
  ): ResolvedKidItemMcpTool | null {
    const tools = context ? this.listToolsForContext(context) : this.listTools();
    const matches = tools.filter(
      (tool) => tool.name === name && typeof tool.capabilityKey === 'string',
    );
    if (matches.length !== 1) return null;

    const descriptor = matches[0];
    if (!descriptor.capabilityKey) return null;
    const handler = this.capabilities.resolve(descriptor.capabilityKey);
    if (!handler) return null;
    return {
      descriptor: descriptor as KidItemMcpToolDescriptor & {
        capabilityKey: string;
      },
      handler,
    };
  }

  resolveCapabilityKey(capabilityKey: string): ResolvedKidItemMcpTool | null {
    if (!this.isExposed(capabilityKey)) return null;
    const handler = this.capabilities.resolve(capabilityKey);
    if (!handler) return null;
    return {
      descriptor: this.toDescriptor(handler),
      handler,
    };
  }

  private isExposed(capabilityKey: string): boolean {
    return (
      this.allowlist.has(capabilityKey) &&
      !FORBIDDEN_MCP_TOOL_KEYS.has(capabilityKey)
    );
  }

  private toDescriptor(
    handler: AgentCapabilityHandler,
    toolKind: KidItemMcpToolDescriptor['toolKind'] = 'domain',
  ): ResolvedKidItemMcpToolDescriptor {
    return {
      name: mcpToolNameForCapability(handler.key),
      capabilityKey: handler.key,
      ownerDomain: handler.ownerDomain,
      approvalRisk: handler.approvalRisk,
      sideEffects: [...handler.sideEffects],
      toolKind,
    };
  }

  private toFirstClassDescriptor(
    handler: AgentCapabilityHandler,
  ): ResolvedKidItemMcpToolDescriptor {
    return {
      ...this.toDescriptor(handler, 'domain'),
      name: firstClassMcpToolNameForCapability(handler.key),
    };
  }

  private toControlDescriptor(
    name: string,
    toolKind: 'common' | 'operator',
  ): KidItemMcpToolDescriptor {
    return {
      name,
      capabilityKey: null,
      ownerDomain: 'agent-os',
      approvalRisk: 'none',
      sideEffects: [],
      toolKind,
    };
  }
}
