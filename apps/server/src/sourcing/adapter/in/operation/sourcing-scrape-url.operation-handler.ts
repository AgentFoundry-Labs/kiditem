import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { OperationHandler, OperationHandlerContext, OperationHandlerResult } from '../../../../common/operation-definition';
import { OPERATION_HANDLER_REGISTRY_PORT, type OperationHandlerRegistryPort } from '../../../../operations/application/port/in/operation-handler-registry.port';
import { SourcingScrapeResultService } from '../../../application/service/sourcing-scrape-result.service';
import { SOURCING_SCRAPE_URL_OPERATION } from '../../../domain/operation/sourcing.operations';
import { SourcingPlaywrightRuntimeHandler } from '../../out/runtime/sourcing-playwright-runtime.handler';

@Injectable()
export class SourcingScrapeUrlOperationHandler implements OperationHandler, OnModuleInit {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT) private readonly registry: OperationHandlerRegistryPort,
    private readonly playwright: SourcingPlaywrightRuntimeHandler,
    private readonly results: SourcingScrapeResultService,
  ) {}

  onModuleInit(): void { this.registry.register(SOURCING_SCRAPE_URL_OPERATION, this); }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    if (context.operationKey !== SOURCING_SCRAPE_URL_OPERATION.key) throw new Error('sourcing_scrape_operation_key_invalid');
    const sourceUrl = SOURCING_SCRAPE_URL_OPERATION.inputSchema.parse(context.input).sourceUrl;
    await context.checkpoint({ stage: 'scraping', progressCurrent: 0, progressTotal: 1 });
    const output = await this.playwright.scrapeProductUrl({ sourceUrl });
    const persisted = await this.results.persist({
      organizationId: context.organizationId,
      triggeredByUserId: context.requestedByUserId,
      output,
    });
    await context.checkpoint({ stage: 'persisted', progressCurrent: 1, progressTotal: 1 });
    return { kind: 'completed', result: { ...output, candidateId: persisted.candidateId, href: persisted.href } };
  }
}
