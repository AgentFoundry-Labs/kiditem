import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AGENT_RUN_EVENTS,
  type AgentRunFinalizedEvent,
} from '../../../agent-os/application/event/agent-run-events';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
  type UpsertCandidateInput,
} from '../port/out/repository/sourcing-candidate.repository.port';
import {
  SOURCING_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';

const PLATFORM_MAP: Record<string, string> = {
  '1688': 'ALIBABA_1688',
  alibaba: 'ALIBABA',
};

const PRODUCT_IMAGE_FIELD_KEYS = [
  'images', 'imageUrls', 'image_urls', 'mainImages', 'main_images',
  'mainImage', 'main_image', 'offerImgList',
] as const;

function collectedCandidateHref(candidateId: string): string {
  return `/product-pipeline/collected-products/${encodeURIComponent(candidateId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

@Injectable()
export class SourcingScrapeFinalizedBridge {
  private readonly logger = new Logger(SourcingScrapeFinalizedBridge.name);

  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(SOURCING_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  @OnEvent(AGENT_RUN_EVENTS.FINALIZED)
  async onAgentRunFinalized(event: AgentRunFinalizedEvent): Promise<void> {
    if (event.agentType !== 'sourcing') return;
    if (event.source !== 'sourcing.scrape_url') return;
    if (event.requestStatus === 'cancelled') return;
    if (event.status === 'failed') return;

    const output = isRecord(event.output) ? event.output : {};
    const scraped = isRecord(output.scraped_data) ? output.scraped_data : null;
    if (!scraped || output.ok !== true) {
      await this.failOperation(
        event,
        nonEmptyString(output.error) ?? '스크래핑 결과를 추출하지 못했습니다.',
        output,
      );
      return;
    }

    const candidate = await this.projectCandidate(event, output, scraped).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to project sourcing scrape output: ${message}`);
      await this.failOperation(event, message);
      return null;
    });
    if (!candidate) return;

    await this.closeSuccessOperation(event, candidate.id);
  }

  private async projectCandidate(
    event: AgentRunFinalizedEvent,
    output: Record<string, unknown>,
    scraped: Record<string, unknown>,
  ) {
    const candidateInput = this.toUpsertInput(event, output, scraped);
    return this.candidates.upsertSourced(candidateInput);
  }

  private async closeSuccessOperation(
    event: AgentRunFinalizedEvent,
    candidateId: string,
  ): Promise<void> {
    try {
      await this.reemitOperation(event, {
        href: collectedCandidateHref(candidateId),
        candidateId,
      });
      await this.operationAlerts.closeBySource(
        event.organizationId,
        'agent_run_request',
        event.requestId,
        'succeeded',
        {
          href: collectedCandidateHref(candidateId),
          message: '소싱 URL 스크래핑이 완료되었습니다.',
          metadata: {
            ...(event.runId ? { runId: event.runId } : {}),
            candidateId,
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to close sourcing scrape operation alert: ${message}`);
    }
  }

  private toUpsertInput(
    event: AgentRunFinalizedEvent,
    output: Record<string, unknown>,
    scraped: Record<string, unknown>,
  ): UpsertCandidateInput {
    const sourceUrl = nonEmptyString(scraped.source_url) ?? nonEmptyString(output.source_url);
    const title = nonEmptyString(scraped.title);
    if (!sourceUrl) throw new Error('sourcing_scrape_missing_source_url');
    if (!title) throw new Error('sourcing_scrape_missing_title');

    const rawPlatform = nonEmptyString(scraped.source_platform) ?? nonEmptyString(output.platform) ?? 'unknown';
    const platform = PLATFORM_MAP[rawPlatform.toLowerCase()] ?? rawPlatform;
    const images = this.extractImageUrls(scraped);
    const description = nonEmptyString(scraped.description) ?? nonEmptyString(scraped.description_text) ?? '';

    return {
      organizationId: event.organizationId,
      sourceUrl,
      sourcePlatform: platform,
      rawData: { ...scraped, source_url: sourceUrl, page_type: scraped.page_type ?? 'detail' },
      name: title,
      description,
      category: nonEmptyString(scraped.category_name),
      tags: Array.isArray(scraped.tags) ? scraped.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      thumbnailUrl: images[0] ?? null,
      imageUrl: images[0] ?? null,
      costCny: this.extractCostCny(scraped, platform),
      triggeredByUserId: event.requestedByUserId,
      images: images.map((url, index) => ({
        url,
        role: 'product',
        label: null,
        sortOrder: index,
        source: 'sourcing-scrape-url',
        isPrimary: index === 0,
      })),
    };
  }

  private async failOperation(
    event: AgentRunFinalizedEvent,
    message: string,
    output?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const recommendedSkillKey = output
        ? nonEmptyString(output.recommendedSkillKey)
        : null;
      const requiresRecovery = output?.requiresRecovery === true;
      await this.reemitOperation(event, {});
      await this.operationAlerts.closeBySource(
        event.organizationId,
        'agent_run_request',
        event.requestId,
        'failed',
        {
          message,
          severity: 'error',
          metadata: {
            ...(event.runId ? { runId: event.runId } : {}),
            errorCode: 'sourcing_scrape_empty_output',
            ...(requiresRecovery ? { requiresRecovery } : {}),
            ...(recommendedSkillKey ? { recommendedSkillKey } : {}),
          },
        },
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to close failed sourcing scrape operation alert: ${errorMessage}`);
    }
  }

  private async reemitOperation(
    event: AgentRunFinalizedEvent,
    result: { href?: string; candidateId?: string },
  ): Promise<void> {
    await this.operationAlerts.start({
      organizationId: event.organizationId,
      operationKey: `sourcing-scrape:${event.requestId}`,
      type: 'sourcing_scrape_url',
      title: '소싱 URL 스크래핑 진행 중',
      sourceType: 'agent_run_request',
      sourceId: event.requestId,
      actorUserId: event.requestedByUserId,
      href: result.href ?? '/product-pipeline/collected-products',
      metadata: {
        agentType: event.agentType,
        source: event.source,
        ...(event.runId ? { runId: event.runId } : {}),
        ...(result.candidateId ? { candidateId: result.candidateId } : {}),
      },
    });
  }

  private extractCostCny(data: Record<string, unknown>, platform: string): number | null {
    const currency = nonEmptyString(data.currency)?.toUpperCase();
    if (currency && currency !== 'CNY') return null;
    if (!currency && platform !== 'ALIBABA_1688') return null;

    for (const key of ['price', 'price_min']) {
      const value = data[key];
      if (value != null) {
        const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    }
    if (typeof data.priceRange === 'string' && data.priceRange.includes('-')) {
      const min = Number.parseFloat(data.priceRange.split('-')[0]);
      if (Number.isFinite(min) && min > 0) return min;
    }
    const offer = isRecord(data.offer) ? data.offer : null;
    if (offer?.price != null) {
      const parsed = Number.parseFloat(String(offer.price));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  private extractImageUrls(data: Record<string, unknown>): string[] {
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const key of PRODUCT_IMAGE_FIELD_KEYS) {
      this.collectImageUrls(data[key], seen, urls);
    }
    return urls;
  }

  private collectImageUrls(value: unknown, seen: Set<string>, urls: string[]): void {
    if (Array.isArray(value)) {
      for (const item of value) this.collectImageUrls(item, seen, urls);
      return;
    }
    const url = this.normalizeImageUrl(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  }

  private normalizeImageUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return null;
  }
}
