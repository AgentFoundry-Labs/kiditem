import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { AiUsageAgentKey, AiUsageSummary } from '@kiditem/shared/ai';
import { estimateCostMicroUsd } from '../../domain/ai-usage';
import { aiUsageMeter } from '../usage/ai-usage-meter';
import {
  AI_USAGE_REPOSITORY_PORT,
  type AiUsageRepositoryPort,
} from '../port/out/repository/ai-usage.repository.port';

/**
 * Owns AI usage metering: binds the meter the provider adapters report to,
 * prices each call once at record time, and answers the per-agent summary.
 */
@Injectable()
export class AiUsageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @Inject(AI_USAGE_REPOSITORY_PORT)
    private readonly repository: AiUsageRepositoryPort,
  ) {}

  onModuleInit(): void {
    aiUsageMeter.bind(async (entry) => {
      try {
        await this.repository.insert({
          ...entry,
          costMicroUsd: estimateCostMicroUsd(entry.model, entry),
        });
      } catch (error) {
        this.logger.warn({ msg: 'ai-usage.record-failed', error: String(error) });
      }
    });
  }

  onModuleDestroy(): void {
    aiUsageMeter.bind(null);
  }

  async summary(input: {
    organizationId: string;
    from: string;
    to: string;
    agentKey?: AiUsageAgentKey;
  }): Promise<AiUsageSummary> {
    const summary = await this.repository.summarize({
      organizationId: input.organizationId,
      from: kstDayStart(input.from),
      to: kstDayStart(input.to, 1),
      agentKey: input.agentKey,
    });
    return { from: input.from, to: input.to, ...summary };
  }
}

/** `YYYY-MM-DD` KST midnight, optionally a number of days later. */
function kstDayStart(date: string, addDays = 0): Date {
  const start = new Date(`${date}T00:00:00+09:00`);
  start.setUTCDate(start.getUTCDate() + addDays);
  return start;
}
