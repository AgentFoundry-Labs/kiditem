import { z } from 'zod';
import { CanonicalResourceRefSchema } from './resource-ref';

const boundedTitleSchema = z.string().min(1).max(120);
const boundedLabelSchema = z.string().min(1).max(80);
const boundedDescriptionSchema = z.string().min(1).max(500);
const textFallbackSchema = z.string().min(1).max(2_000);

export const InteractionRouteKeySchema = z.enum([
  'dashboard',
  'agent_os',
  'sourcing_recommendations',
  'sourcing_candidate',
  'inventory_stock_ops',
]);

const freshnessSchema = z
  .object({
    observedAt: z.string().datetime(),
    label: boundedLabelSchema,
  })
  .strict();

const metricTrendSchema = z
  .object({
    direction: z.enum(['up', 'down', 'flat']),
    value: z.number().finite(),
    label: boundedLabelSchema,
  })
  .strict();

const metricItemSchema = z
  .object({
    key: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/),
    label: boundedLabelSchema,
    value: z.union([z.string().min(1).max(200), z.number().finite()]),
    format: z.enum(['plain', 'number', 'percent', 'krw']),
    trend: metricTrendSchema.nullable(),
  })
  .strict();

export const MetricGroupResultSchema = z
  .object({
    kind: z.literal('metric_group'),
    title: boundedTitleSchema,
    items: z.array(metricItemSchema).min(1).max(12),
    freshness: freshnessSchema,
    textFallback: textFallbackSchema,
  })
  .strict();

export const NoticeResultSchema = z
  .object({
    kind: z.literal('notice'),
    tone: z.enum(['info', 'success', 'warning', 'error']),
    title: boundedTitleSchema,
    body: z.string().min(1).max(1_000),
    textFallback: textFallbackSchema,
  })
  .strict();

const resourceListItemSchema = z
  .object({
    label: boundedLabelSchema,
    description: boundedDescriptionSchema.nullable(),
    resourceRef: CanonicalResourceRefSchema,
  })
  .strict();

export const ResourceListResultSchema = z
  .object({
    kind: z.literal('resource_list'),
    title: boundedTitleSchema,
    items: z.array(resourceListItemSchema).min(1).max(20),
    textFallback: textFallbackSchema,
  })
  .strict();

const comparisonRowSchema = z
  .object({
    label: boundedLabelSchema,
    values: z.array(z.string().min(1).max(200)).min(2).max(6),
  })
  .strict();

export const ComparisonResultSchema = z
  .object({
    kind: z.literal('comparison'),
    title: boundedTitleSchema,
    columns: z.array(boundedLabelSchema).min(2).max(6),
    rows: z.array(comparisonRowSchema).min(1).max(20),
    textFallback: textFallbackSchema,
  })
  .strict();

export const NavigationResultSchema = z
  .object({
    kind: z.literal('navigation'),
    actionId: z.string().uuid(),
    routeKey: InteractionRouteKeySchema,
    resourceRef: CanonicalResourceRefSchema.nullable(),
    label: boundedLabelSchema,
    disabledReason: z.string().min(1).max(200).nullable(),
    expiresAt: z.string().datetime(),
    textFallback: textFallbackSchema,
  })
  .strict();

const suggestedReplySchema = z
  .object({
    id: z.string().min(1).max(128),
    label: boundedLabelSchema,
    content: z.string().min(1).max(500),
  })
  .strict();

export const SuggestedRepliesResultSchema = z
  .object({
    kind: z.literal('suggested_replies'),
    messageId: z.string().min(1).max(128),
    replies: z.array(suggestedReplySchema).min(1).max(3),
    textFallback: textFallbackSchema,
  })
  .strict();

export const InteractionUiResultSchema = z.discriminatedUnion('kind', [
  MetricGroupResultSchema,
  NoticeResultSchema,
  ResourceListResultSchema,
  ComparisonResultSchema,
  NavigationResultSchema,
  SuggestedRepliesResultSchema,
]);

export type InteractionRouteKey = z.infer<typeof InteractionRouteKeySchema>;
export type MetricGroupResult = z.infer<typeof MetricGroupResultSchema>;
export type NoticeResult = z.infer<typeof NoticeResultSchema>;
export type ResourceListResult = z.infer<typeof ResourceListResultSchema>;
export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;
export type NavigationResult = z.infer<typeof NavigationResultSchema>;
export type SuggestedRepliesResult = z.infer<typeof SuggestedRepliesResultSchema>;
export type InteractionUiResult = z.infer<typeof InteractionUiResultSchema>;
