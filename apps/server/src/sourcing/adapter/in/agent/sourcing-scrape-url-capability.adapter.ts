import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import type {
  SourcingScrapeUrlWorkflowInput,
  SourcingScrapeUrlWorkflowPort,
  SourcingScrapeUrlWorkflowResult,
} from '../../../application/port/in/capability/sourcing-capability.ports';
import { SourcingService } from '../../../application/service/sourcing.service';
import { SourcingPlaywrightRuntimeHandler } from '../../out/runtime/sourcing-playwright-runtime.handler';

const SCRAPE_URL_WORKFLOW_KEY = 'sourcing.scrapeUrlWorkflow';
const SCRAPE_PRODUCT_URL_KEY = 'sourcing.scrapeProductUrl';
const SCRAPE_PRODUCT_ARTIFACT_CONTRACT_VERSION = 'candidate-v2';
const COLLECTED_PRODUCTS_HREF = '/product-pipeline/collected-products';

const ScrapeUrlInputSchema = z
  .object({
    sourceUrl: z.string().trim().optional(),
    url: z.string().trim().optional(),
  })
  .refine((input) => Boolean(sourceUrlOf(input)), {
    message: 'sourceUrl or url is required',
  });

const ScrapeUrlOutputSchema = z.object({
  skipped: z.boolean(),
  candidateId: z.string().nullable(),
  href: z.string().nullable(),
  operationKey: z.string().nullable(),
  taskId: z.string().nullable().optional(),
});
const ScrapeProductUrlOutputSchema = z
  .object({
    ok: z.boolean(),
    source_url: z.string(),
    platform: z.string().nullable().optional(),
    requiresRecovery: z.boolean().optional(),
    recommendedSkillKey: z.string().optional(),
    recoveryReason: z.string().optional(),
  })
  .passthrough();

type ScrapeUrlInput = z.infer<typeof ScrapeUrlInputSchema>;

function sourceUrlOf(input: { sourceUrl?: string | null; url?: string | null }): string | null {
  return input.sourceUrl?.trim() || input.url?.trim() || null;
}

function outputSummaryOf(result: SourcingScrapeUrlWorkflowResult): Record<string, unknown> {
  return {
    skipped: result.skipped,
    candidateId: result.candidateId,
    href: result.href,
    operationKey: result.operationKey,
    taskId: result.taskId ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordField(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function firstStringField(
  value: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const field = stringField(value[key]);
    if (field) return field;
  }
  return null;
}

function productDataOf(output: Record<string, unknown>): Record<string, unknown> {
  return (
    recordField(output, 'scraped_data') ??
    recordField(output, 'scrapedData') ??
    recordField(output, 'product') ??
    output
  );
}

function candidateTitleOf(output: Record<string, unknown>): string {
  const productData = productDataOf(output);
  const title =
    firstStringField(productData, ['title', 'productName', 'name']) ??
    firstStringField(output, ['title', 'productName', 'name']);
  return title ? `${title} 소싱 후보` : '소싱 후보';
}

function candidateTargetIdOf(
  output: Record<string, unknown>,
  sourceUrl: string,
): string {
  const productData = productDataOf(output);
  return (
    firstStringField(productData, [
      'product_id',
      'productId',
      'offerId',
      'offer_id',
      'id',
    ]) ??
    firstStringField(output, ['candidateId', 'productId', 'offerId', 'id']) ??
    sourceUrl
  );
}

@Injectable()
export class SourcingScrapeUrlCapabilityAdapter
  implements OnModuleInit, SourcingScrapeUrlWorkflowPort
{
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    private readonly sourcing: SourcingService,
    private readonly playwright: SourcingPlaywrightRuntimeHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.workflowHandler());
    this.registry.register(this.scrapeProductHandler());
  }

  async scrapeUrlWorkflow(
    input: SourcingScrapeUrlWorkflowInput,
  ): Promise<SourcingScrapeUrlWorkflowResult> {
    const sourceUrl = sourceUrlOf(input);
    if (!sourceUrl) {
      throw new Error('sourceUrl or url is required');
    }
    const result = await this.sourcing.scrapeUrl(
      sourceUrl,
      input.organizationId,
      input.triggeredByUserId ?? null,
      {
        conversationId: input.conversationId ?? null,
        parentRequestId: input.parentRequestId ?? null,
        delegatedByRunId: input.delegatedByRunId ?? null,
      },
    );
    return {
      skipped: Boolean(result.skipped),
      candidateId: result.candidateId ?? null,
      href: result.href ?? null,
      operationKey: result.operationKey ?? null,
      taskId: result.taskId ?? null,
    };
  }

  private workflowHandler(): AgentCapabilityHandler<ScrapeUrlInput> {
    return {
      key: SCRAPE_URL_WORKFLOW_KEY,
      ownerDomain: 'sourcing',
      executionKind: 'workflow',
      inputSchema: ScrapeUrlInputSchema,
      outputSchema: ScrapeUrlOutputSchema,
      sideEffects: ['browser', 'external_io', 'db_write', 'job_enqueue'],
      approvalRisk: 'low',
      idempotencyKey: ({ organizationId, input }) => {
        const sourceUrl = sourceUrlOf(input);
        return sourceUrl
          ? [organizationId, SCRAPE_URL_WORKFLOW_KEY, sourceUrl].join(':')
          : null;
      },
      execute: async (executionInput) => {
        const { organizationId, requestedByUserId, input } = executionInput;
        const result = await this.scrapeUrlWorkflow({
          organizationId,
          triggeredByUserId: requestedByUserId ?? null,
          sourceUrl: sourceUrlOf(input) ?? '',
          conversationId: executionInput.conversationId ?? null,
          parentRequestId: executionInput.requestId ?? null,
          delegatedByRunId: executionInput.runId ?? null,
        });
        const targetId = result.candidateId ?? result.taskId ?? result.operationKey;
        return {
          resourceType: 'sourcing_scrape_url_workflow',
          resourceId: targetId,
          outputSummary: outputSummaryOf(result),
          artifacts: [
            {
              artifactType: 'sourcing_scrape_request',
              targetDomain: 'sourcing',
              targetModel: 'SourcingScrapeUrlWorkflow',
              targetId,
              title: result.skipped ? '기존 소싱 상품' : '소싱 URL 수집 요청',
              href: result.href ?? COLLECTED_PRODUCTS_HREF,
              summary: outputSummaryOf(result),
            },
          ],
        };
      },
    };
  }

  private scrapeProductHandler(): AgentCapabilityHandler<ScrapeUrlInput> {
    return {
      key: SCRAPE_PRODUCT_URL_KEY,
      ownerDomain: 'sourcing',
      executionKind: 'tool',
      inputSchema: ScrapeUrlInputSchema,
      outputSchema: ScrapeProductUrlOutputSchema,
      sideEffects: ['browser', 'external_io'],
      approvalRisk: 'low',
      idempotencyKey: ({ organizationId, input }) => {
        const sourceUrl = sourceUrlOf(input);
        return sourceUrl
          ? [
              organizationId,
              SCRAPE_PRODUCT_URL_KEY,
              SCRAPE_PRODUCT_ARTIFACT_CONTRACT_VERSION,
              sourceUrl,
            ].join(':')
          : null;
      },
      execute: async (executionInput) => {
        const sourceUrl = sourceUrlOf(executionInput.input);
        if (!sourceUrl) {
          throw new Error('sourceUrl or url is required');
        }
        const result = await this.playwright.execute({
          organizationId: executionInput.organizationId,
          agentInstanceId: executionInput.agentInstanceId,
          agentType: executionInput.agentType,
          requestId: executionInput.requestId ?? 'mcp-sourcing-scrape-url',
          runId: executionInput.runId ?? 'mcp-sourcing-scrape-url',
          taskSessionId: 'mcp-sourcing-scrape-url',
          taskKey: 'sourcing_scrape_url',
          adapterType: 'playwright',
          model: 'deterministic',
          modelPlan: { primary: 'deterministic' },
          promptPath: 'agent-config/prompts/agents/sourcing.md',
          input: {
            action: 'scrape_url',
            url: sourceUrl,
          },
          trustLevel: 1,
          runtimeConfig: {},
        });
        const output = {
          ...result.output,
          source_url:
            typeof result.output.source_url === 'string'
              ? result.output.source_url
              : sourceUrl,
          platform:
            typeof result.output.platform === 'string'
              ? result.output.platform
              : null,
        };
        return {
          resourceType: 'sourcing_scrape_url',
          resourceId: sourceUrl,
          outputSummary: output,
          artifacts: [
            {
              artifactType: 'sourcing_scrape_snapshot',
              targetDomain: 'sourcing',
              targetModel: 'SourcingScrapeSnapshot',
              targetId: sourceUrl,
              title:
                typeof output.platform === 'string' && output.platform
                  ? `${output.platform} scrape snapshot`
                  : 'Sourcing scrape snapshot',
              href: null,
              summary: output,
            },
            {
              artifactType: 'sourcing_candidate',
              targetDomain: 'sourcing',
              targetModel: 'SourcingCandidateDraft',
              targetId: candidateTargetIdOf(output, sourceUrl),
              title: candidateTitleOf(output),
              href: null,
              summary: {
                ...output,
                candidateSource: SCRAPE_PRODUCT_URL_KEY,
              },
            },
          ],
        };
      },
    };
  }
}
