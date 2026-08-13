import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  InteractionUiResultSchema,
  NavigationResultSchema,
  type InteractionUiResult,
  type NavigationResult,
  type CanonicalResourceRef,
} from '@kiditem/shared/agent-interaction';
import { AgentOsBoundaryError } from '../../domain/agent-os.errors';

type InteractionActor = { organizationId: string; userId: string; sessionId: string | null };
type IssuedNavigation = InteractionActor & NavigationResult;
const NAVIGATION_TTL_MS = 5 * 60_000;
const MAX_OUTSTANDING_ACTIONS = 10_000;
const ROUTE_HREF = {
  dashboard: '/dashboard',
  agent_os: '/agent-os',
  sourcing_recommendations: '/sourcing-ai/recommendations',
  sourcing_candidate: '/sourcing-ai/recommendations',
  inventory_stock_ops: '/stock-ops',
} as const;

@Injectable()
export class AgentInteractionPresentationService {
  private readonly actions = new Map<string, IssuedNavigation>();

  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly issueId: () => string = randomUUID,
    private readonly canAccessCurrentVersion: (
      actor: InteractionActor,
      resourceRef: CanonicalResourceRef,
    ) => boolean = () => false,
  ) {}

  projectCapabilityResult(
    actor: InteractionActor,
    capabilityKey: string,
    executionResult: unknown,
  ): InteractionUiResult {
    const result = z.object({ outputSummary: z.record(z.unknown()) }).passthrough()
      .parse(executionResult);
    const projected = CAPABILITY_PROJECTORS[capabilityKey]?.(result.outputSummary, this.clock());
    if (!projected) throw new AgentOsBoundaryError('INTERACTION_PRESENTATION_INVALID');
    return this.present(actor, projected);
  }

  present(actor: InteractionActor, raw: unknown): InteractionUiResult {
    if (!raw || typeof raw !== 'object' || (raw as { kind?: unknown }).kind !== 'navigation') {
      return InteractionUiResultSchema.parse(raw);
    }
    const input = raw as Record<string, unknown>;
    const provisional = NavigationResultSchema.parse({
      ...input,
      actionId: this.issueId(),
      expiresAt: new Date(this.clock().getTime() + NAVIGATION_TTL_MS).toISOString(),
    });
    const permittedKeys = new Set(['kind', 'routeKey', 'resourceRef', 'label', 'disabledReason', 'textFallback']);
    if (Object.keys(input).some((key) => !permittedKeys.has(key))) {
      throw new AgentOsBoundaryError('INTERACTION_PRESENTATION_INVALID');
    }
    if (!this.hasValidResourceScope(provisional)) {
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_RESOURCE_INVALID');
    }
    this.pruneExpiredActions();
    if (this.actions.size >= MAX_OUTSTANDING_ACTIONS) {
      const oldest = this.actions.keys().next().value;
      if (oldest) this.actions.delete(oldest);
    }
    this.actions.set(provisional.actionId, { ...actor, ...provisional });
    return provisional;
  }

  authorize(actor: InteractionActor, actionId: string): { href: string } {
    const action = this.actions.get(actionId);
    if (!action || action.organizationId !== actor.organizationId || action.userId !== actor.userId) {
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    }
    if (new Date(action.expiresAt).getTime() <= this.clock().getTime()) {
      this.actions.delete(actionId);
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_EXPIRED');
    }
    if (action.disabledReason) throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    if (!this.hasValidResourceScope(action)) {
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    }
    if (action.resourceRef && !this.canAccessCurrentVersion(actor, action.resourceRef)) {
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    }
    const href = ROUTE_HREF[action.routeKey as keyof typeof ROUTE_HREF];
    if (!href) throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    return { href };
  }

  private hasValidResourceScope(action: NavigationResult): boolean {
    if (action.routeKey === 'sourcing_candidate') {
      return action.resourceRef?.kind === 'sourcing_candidate' && action.resourceRef.version !== null;
    }
    return action.resourceRef === null;
  }

  private pruneExpiredActions(): void {
    const now = this.clock().getTime();
    for (const [actionId, action] of this.actions) {
      if (new Date(action.expiresAt).getTime() <= now) this.actions.delete(actionId);
    }
  }
}

type CapabilityProjector = (
  summary: Record<string, unknown>,
  now: Date,
) => InteractionUiResult;

const analyticsOverviewSchema = z.object({
  sales: z.object({ revenue: z.number(), orders: z.number().int().nonnegative() }).strict(),
  inventory: z.object({
    outOfStockSkus: z.number().int().nonnegative(),
    mappingAttentionSkus: z.number().int().nonnegative(),
  }).strict(),
  freshness: z.object({
    lastSync: z.string().datetime().nullable(),
    confirmedUntil: z.string().nullable(),
  }).strict(),
}).strict();
const sourcingEvidenceSchema = z.object({
  inputHash: z.string().min(1).max(128),
  documentCount: z.number().int().nonnegative(),
  citationIds: z.array(z.string().min(1).max(128)).max(20),
  dataGaps: z.array(z.string().min(1).max(200)).max(20),
}).strict();
const sourcingRunSchema = z.object({
  runId: z.string().min(1).max(128),
  status: z.enum(['complete', 'partial', 'failed']),
  businessDate: z.string().min(1).max(32),
  itemCount: z.number().int().nonnegative(),
  warningCodes: z.array(z.string().min(1).max(128)).max(20),
  validation: z.object({
    itemCount: z.number().int().nonnegative(),
    missingCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();

const CAPABILITY_PROJECTORS: Readonly<Record<string, CapabilityProjector>> = {
  'agent_os.platform_probe': (summary) => {
    z.object({ status: z.literal('available') }).strict().parse(summary);
    return InteractionUiResultSchema.parse({
      kind: 'notice', tone: 'success', title: 'Agent OS 사용 가능',
      body: 'Agent OS 읽기 전용 기능이 정상적으로 응답했습니다.',
      textFallback: 'Agent OS 읽기 전용 기능을 사용할 수 있습니다.',
    });
  },
  'analytics.readOverview': (summary, now) => {
    const value = analyticsOverviewSchema.parse(summary);
    return InteractionUiResultSchema.parse({
      kind: 'metric_group', title: '운영 지표',
      items: [
        { key: 'revenue', label: '매출', value: value.sales.revenue, format: 'krw', trend: null },
        { key: 'orders', label: '주문', value: value.sales.orders, format: 'number', trend: null },
        { key: 'out_of_stock', label: '품절 SKU', value: value.inventory.outOfStockSkus, format: 'number', trend: null },
        { key: 'mapping_attention', label: '매핑 확인 SKU', value: value.inventory.mappingAttentionSkus, format: 'number', trend: null },
      ],
      freshness: {
        observedAt: value.freshness.lastSync ?? now.toISOString(),
        label: value.freshness.confirmedUntil
          ? `확정 ${value.freshness.confirmedUntil}`
          : '현재 조회',
      },
      textFallback: `매출 ${value.sales.revenue}, 주문 ${value.sales.orders}, 품절 SKU ${value.inventory.outOfStockSkus}입니다.`,
    });
  },
  'sourcing.retrieveWorkspaceEvidence': (summary) => {
    const value = sourcingEvidenceSchema.parse(summary);
    const citations = value.citationIds.length > 0
      ? value.citationIds
      : [value.inputHash];
    return InteractionUiResultSchema.parse({
      kind: 'resource_list', title: '소싱 근거',
      items: citations.map((id, index) => ({
        label: value.citationIds.length > 0 ? `근거 ${index + 1}` : '검색 근거 없음',
        description: value.dataGaps[index] ?? null,
        resourceRef: {
          kind: value.citationIds.length > 0 ? 'sourcing_evidence' : 'sourcing_evidence_query',
          id,
          version: null,
        },
      })),
      textFallback: `소싱 근거 문서 ${value.documentCount}건을 확인했습니다.`,
    });
  },
  'sourcing.inspectRecommendationRun': (summary) => {
    const value = sourcingRunSchema.parse(summary);
    return InteractionUiResultSchema.parse({
      kind: 'comparison', title: '소싱 추천 실행', columns: ['항목', '값'],
      rows: [
        { label: '상태', values: ['상태', value.status] },
        { label: '기준일', values: ['기준일', value.businessDate] },
        { label: '추천 수', values: ['추천 수', String(value.itemCount)] },
        { label: '누락 수', values: ['누락 수', String(value.validation.missingCount)] },
      ],
      textFallback: `소싱 추천 실행 ${value.runId}은 ${value.status} 상태이며 ${value.itemCount}건입니다.`,
    });
  },
};
