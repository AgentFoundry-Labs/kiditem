import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

const EmptyInputSchema = z.object({}).strict();

export const PRODUCT_PROFITABILITY_OPERATIONS = [
  {
    key: 'products.refresh_profitability_evidence',
    version: 1,
    title: '수익성 데이터 갱신',
    ownerDomain: 'products',
    engineType: 'composite',
    allowedTriggers: ['dashboard', 'domain_screen'],
    scheduleSupported: false,
    maxAttempts: 3,
    inputSchema: EmptyInputSchema,
  },
  {
    key: 'products.recalculate_profitability_abc',
    version: 1,
    title: '수익성 ABC 재계산',
    ownerDomain: 'products',
    engineType: 'domain',
    allowedTriggers: [],
    scheduleSupported: false,
    maxAttempts: 2,
    inputSchema: EmptyInputSchema,
  },
] as const satisfies readonly OperationDefinition[];

export const PROFITABILITY_REFRESH_STAGES = [
  {
    operationKey: 'inventory.refresh_sellpia_snapshot',
    input: { reason: 'manual_request', scope: 'full' },
  },
  {
    operationKey: 'advertising.refresh_profitability_spend',
    input: {},
  },
  {
    operationKey: 'products.recalculate_profitability_abc',
    input: {},
  },
] as const;
