import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

const SourcingShadowSignalInputSchema = z.object({}).strict();
export const SourcingScrapeUrlInputSchema = z.object({
  sourceUrl: z.string().trim().min(1).max(2_000),
}).strict();

export const SOURCING_SHADOW_SIGNAL_OPERATION = {
  key: 'sourcing.collect_shadow_signals',
  version: 1,
  title: '시장 shadow 신호 수집',
  ownerDomain: 'sourcing',
  engineType: 'domain',
  allowedTriggers: ['dashboard', 'domain_screen', 'agent'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'snapshot_compute',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingShadowSignalInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_SCRAPE_URL_OPERATION = {
  key: 'sourcing.scrape_url',
  version: 1,
  title: '소싱 URL 스크래핑',
  ownerDomain: 'sourcing',
  engineType: 'browser',
  allowedTriggers: ['domain_screen', 'agent'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'playwright_1688',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingScrapeUrlInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_OPERATIONS = [
  SOURCING_SHADOW_SIGNAL_OPERATION,
  SOURCING_SCRAPE_URL_OPERATION,
] as const satisfies readonly OperationDefinition[];
