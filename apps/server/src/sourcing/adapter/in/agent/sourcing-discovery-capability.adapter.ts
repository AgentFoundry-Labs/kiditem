import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import { withOrderDraftHandoff } from '../../../../agent-os/domain/agent-handoff-intent';
import type {
  SourcingDiscoveryCapabilityInput,
  SourcingDiscoveryCapabilityPort,
  SourcingDiscoveryCapabilityResult,
  SourcingScrapeUrlWorkflowPort,
} from '../../../application/port/in/capability/sourcing-capability.ports';
import {
  SOURCING_SCRAPE_URL_WORKFLOW_PORT,
} from '../../../application/port/in/capability/sourcing-capability.ports';
import { SourcingMarketDiscoveryService } from '../../../application/service/sourcing-market-discovery.service';

const DiscoveryInputSchema = z.object({
  keyword: z.string().min(1),
  category: z.string().nullable().optional(),
  mode: z.literal('replay').default('replay'),
  sourceUrl: z.string().trim().optional(),
  supplierUrl: z.string().trim().optional(),
  url: z.string().trim().optional(),
  supplierUrls: z.array(z.string().trim().min(1)).optional(),
});
const CountOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  dataGaps: z.array(z.string()),
  scrapeWorkflowRequests: z.number().int().nonnegative().optional(),
});
const RecommendationOutputSchema = z.object({
  recommendations: z.number().int().nonnegative(),
  topScore: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  dataGaps: z.array(z.string()),
});

const INPUT_URL_KEYS = ['supplierUrl', 'sourceUrl', 'url'] as const;
const ROW_URL_KEYS = [
  'sourceUrl',
  'source_url',
  'supplierUrl',
  'supplier_url',
  'url',
  'detailUrl',
  'detail_url',
] as const;

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalStringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function inputSourceUrls(input: Record<string, unknown>): string[] {
  const scalarUrls = INPUT_URL_KEYS.map((key) => optionalStringField(input[key]));
  const arrayUrls = Array.isArray(input.supplierUrls)
    ? input.supplierUrls.map(optionalStringField)
    : [];
  return uniqueStrings([...scalarUrls, ...arrayUrls]);
}

function rowSourceUrl(row: Record<string, unknown>): string | null {
  for (const key of ROW_URL_KEYS) {
    const value = optionalStringField(row[key]);
    if (value) return value;
  }
  return null;
}

function supplierSourceUrls(
  input: Record<string, unknown>,
  rows: Array<Record<string, unknown>>,
): string[] {
  return uniqueStrings([...inputSourceUrls(input), ...rows.map(rowSourceUrl)]);
}

function modeField(_value: unknown): 'replay' {
  return 'replay';
}

function artifactTargetId(
  artifactType: string,
  row: Record<string, unknown>,
): string {
  const directId = ['id', 'offerId', 'productId', 'videoKey', 'sourceSnapshotId']
    .map((key) => optionalStringField(row[key]))
    .find(Boolean);
  if (directId) return `${artifactType}:${directId}`;

  const identity = JSON.stringify(row, Object.keys(row).sort());
  return `${artifactType}:${stableHash(identity)}`;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function discoveryIdempotency(capabilityKey: string) {
  return ({
    organizationId,
    requestId,
    input,
  }: {
    organizationId: string;
    requestId?: string | null;
    input: Record<string, unknown>;
  }) => {
    const source = requestId
      ? `request:${requestId}`
      : [
          'content',
          stringField(input.keyword) || 'missing-keyword',
          optionalStringField(input.category) ?? 'none',
          modeField(input.mode),
          inputSourceUrls(input).join(',') || 'none',
        ].join(':');

    return [organizationId, capabilityKey, source].join(':');
  };
}

@Injectable()
export class SourcingDiscoveryCapabilityAdapter
  implements OnModuleInit, SourcingDiscoveryCapabilityPort
{
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    private readonly discovery: SourcingMarketDiscoveryService,
    @Optional()
    @Inject(SOURCING_SCRAPE_URL_WORKFLOW_PORT)
    private readonly scrapeWorkflow?: SourcingScrapeUrlWorkflowPort,
  ) {}

  onModuleInit(): void {
    for (const handler of this.handlers()) {
      this.registry.register(handler);
    }
  }

  async executeDiscoveryCapability(
    input: SourcingDiscoveryCapabilityInput,
  ): Promise<SourcingDiscoveryCapabilityResult> {
    const result = await this.discovery.discover(input);
    return {
      artifacts: result.recommendations.map((recommendation) => ({
        artifactType: 'sourcing_recommendation',
        title: recommendation.artifact.title,
        summary: withOrderDraftHandoff(recommendation.artifact.summary),
      })),
    };
  }

  private handlers(): AgentCapabilityHandler[] {
    return [
      this.countHandler({
        key: 'market.collect_keyword_category_rankings',
        executionKind: 'job_trigger',
        artifactType: 'market_signal_snapshot',
        targetModel: 'MarketSignalSnapshot',
        title: '시장 신호 스냅샷',
        pick: (result) => result.marketSignals,
      }),
      this.countHandler({
        key: 'coupang.match_products',
        executionKind: 'tool',
        artifactType: 'coupang_product_match',
        targetModel: 'CoupangProductMatch',
        title: '쿠팡 매칭 상품',
        pick: (result) => result.coupangMatches,
      }),
      this.countHandler({
        key: 'coupang.collect_tracking_snapshot',
        executionKind: 'job_trigger',
        artifactType: 'coupang_tracking_snapshot',
        targetModel: 'CoupangTrackingSnapshot',
        title: '쿠팡 추적 스냅샷',
        pick: (result) => result.trackingSnapshots,
      }),
      this.countHandler({
        key: 'supplier1688.match_products',
        executionKind: 'workflow',
        artifactType: 'supplier_match',
        targetModel: 'SupplierMatch',
        title: '1688 공급처 매칭',
        pick: (result) => result.supplierMatches,
        sideEffects: ['read', 'browser', 'external_io', 'db_write', 'job_enqueue'],
        approvalRisk: 'low',
        executeRows: (input) => this.executeSupplierMatches(input),
      }),
      this.countHandler({
        key: 'sourcing.score_opportunities',
        executionKind: 'scorer',
        artifactType: 'sourcing_opportunity_score',
        targetModel: 'SourcingOpportunityScore',
        title: '소싱 기회 점수',
        pick: (result) => result.scoredOpportunities,
      }),
      {
        key: 'sourcing.create_recommendation_packet',
        ownerDomain: 'sourcing',
        executionKind: 'workflow',
        inputSchema: DiscoveryInputSchema,
        outputSchema: RecommendationOutputSchema,
        sideEffects: ['read'],
        approvalRisk: 'none',
        idempotencyKey: discoveryIdempotency(
          'sourcing.create_recommendation_packet:handoff_v1',
        ),
        execute: async ({ organizationId, input }) => {
          const result = await this.discover(organizationId, input);
          const first = result.recommendations[0];
          return {
            resourceType: 'sourcing_recommendation',
            resourceId: first?.id ?? null,
            outputSummary: {
              recommendations: result.recommendations.length,
              topScore: first?.score.score ?? null,
              confidence: result.confidence,
              dataGaps: result.dataGaps,
            },
            artifacts: result.recommendations.map((recommendation) => ({
              artifactType: 'sourcing_recommendation',
              targetDomain: 'sourcing',
              targetModel: 'SourcingRecommendation',
              targetId: recommendation.id,
              title: recommendation.artifact.title,
              summary: withOrderDraftHandoff(recommendation.artifact.summary),
            })),
          };
        },
      },
    ];
  }

  private countHandler(input: {
    key: string;
    executionKind: 'tool' | 'workflow' | 'job_trigger' | 'scorer';
    artifactType: string;
    targetModel: string;
    title: string;
    sideEffects?: AgentCapabilityHandler['sideEffects'];
    approvalRisk?: AgentCapabilityHandler['approvalRisk'];
    pick(result: Awaited<ReturnType<SourcingMarketDiscoveryService['discover']>>): object[];
    executeRows?(input: {
      organizationId: string;
      conversationId: string | null;
      parentRequestId: string | null;
      delegatedByRunId: string | null;
      requestedByUserId: string | null;
      capabilityInput: Record<string, unknown>;
      rows: Array<Record<string, unknown>>;
      confidence: number;
      dataGaps: string[];
    }): Promise<{
      outputSummary: Record<string, unknown>;
      rows: Array<Record<string, unknown>>;
    }>;
  }): AgentCapabilityHandler {
    return {
      key: input.key,
      ownerDomain: 'sourcing',
      executionKind: input.executionKind,
      inputSchema: DiscoveryInputSchema,
      outputSchema: CountOutputSchema,
      sideEffects: input.sideEffects ?? ['read'],
      approvalRisk: input.approvalRisk ?? 'none',
      idempotencyKey: discoveryIdempotency(input.key),
      execute: async (executionInput) => {
        const {
          organizationId,
          conversationId,
          requestId,
          runId,
          requestedByUserId,
          input: capabilityInput,
        } = executionInput;
        const result = await this.discover(organizationId, capabilityInput);
        const pickedRows = input.pick(result).map((row) => ({ ...row }));
        const execution = input.executeRows
          ? await input.executeRows({
              organizationId,
              conversationId: conversationId ?? null,
              parentRequestId: requestId ?? null,
              delegatedByRunId: runId ?? null,
              requestedByUserId: requestedByUserId ?? null,
              capabilityInput,
              rows: pickedRows,
              confidence: result.confidence,
              dataGaps: result.dataGaps,
            })
          : {
              outputSummary: {
                count: pickedRows.length,
                confidence: result.confidence,
                dataGaps: result.dataGaps,
              },
              rows: pickedRows,
            };
        return {
          outputSummary: execution.outputSummary,
          artifacts: execution.rows.map((row) => ({
            artifactType: input.artifactType,
            targetDomain: 'sourcing',
            targetModel: input.targetModel,
            targetId: artifactTargetId(input.artifactType, row),
            title: input.title,
            summary: row,
          })),
        };
      },
    };
  }

  private discover(organizationId: string, input: Record<string, unknown>) {
    return this.discovery.discover({
      organizationId,
      keyword: stringField(input.keyword),
      category: optionalStringField(input.category),
      mode: modeField(input.mode),
    });
  }

  private async executeSupplierMatches(input: {
    organizationId: string;
    conversationId: string | null;
    parentRequestId: string | null;
    delegatedByRunId: string | null;
    requestedByUserId: string | null;
    capabilityInput: Record<string, unknown>;
    rows: Array<Record<string, unknown>>;
    confidence: number;
    dataGaps: string[];
  }): Promise<{
    outputSummary: Record<string, unknown>;
    rows: Array<Record<string, unknown>>;
  }> {
    const urls = supplierSourceUrls(input.capabilityInput, input.rows);
    if (!this.scrapeWorkflow || urls.length === 0) {
      return {
        outputSummary: {
          count: input.rows.length,
          confidence: input.confidence,
          dataGaps: input.dataGaps,
        },
        rows: input.rows,
      };
    }

    const workflowByUrl = new Map<
      string,
      Awaited<ReturnType<SourcingScrapeUrlWorkflowPort['scrapeUrlWorkflow']>>
    >();
    for (const sourceUrl of urls) {
      workflowByUrl.set(
        sourceUrl,
        await this.scrapeWorkflow.scrapeUrlWorkflow({
          organizationId: input.organizationId,
          sourceUrl,
          triggeredByUserId: input.requestedByUserId,
          conversationId: input.conversationId,
          parentRequestId: input.parentRequestId,
          delegatedByRunId: input.delegatedByRunId,
        }),
      );
    }

    return {
      outputSummary: {
        count: input.rows.length,
        confidence: input.confidence,
        dataGaps: input.dataGaps,
        scrapeWorkflowRequests: workflowByUrl.size,
      },
      rows: input.rows.map((row, index) => {
        const sourceUrl = rowSourceUrl(row) ?? urls[index] ?? null;
        const workflow = sourceUrl ? workflowByUrl.get(sourceUrl) : null;
        return {
          ...row,
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(workflow
            ? {
                candidateId: workflow.candidateId,
                href: workflow.href,
                operationKey: workflow.operationKey,
                taskId: workflow.taskId ?? null,
                scrapeSkipped: workflow.skipped,
              }
            : {}),
        };
      }),
    };
  }
}
