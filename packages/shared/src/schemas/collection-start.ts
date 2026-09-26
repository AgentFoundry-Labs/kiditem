import { z } from 'zod';
import { shiftBusinessDateKey } from '../common';

/**
 * Producers whose collection needs a browser resource that one collection in a
 * browser environment holds at a time. Any path that starts one of them asks
 * the extension through the single start contract below (KID-147): the
 * collections that take turns in the Coupang collection window. The Wing
 * catalog (KID-354) and the Wing itemwinner (KID-362) are operation kinds now
 * (`operation.start`).
 * The extension takes the resource's turn and opens the attempt with the
 * source owner. When another collection holds it, the extension refuses
 * without opening an attempt.
 */
export const COLLECTION_START_PRODUCERS = [
  'advertising.ad_sync',
  'advertising.ad_keyword',
  'advertising.profitability_import',
  'dashboard.wing_sales',
] as const;

export const CollectionStartProducerSchema = z.enum(COLLECTION_START_PRODUCERS);
export type CollectionStartProducer = z.infer<typeof CollectionStartProducerSchema>;

/** External extension action that carries a collection start. */
export const COLLECTION_START_ACTION = 'startCollection' as const;
/** Extension `ping` capability that announces the start contract. */
export const COLLECTION_START_CAPABILITY = 'collectionStartV1' as const;

const AttemptIdSchema = z.string().uuid();
const CalendarDateSchema = z.string().date();
const AccountScopeSchema = z
  .object({ channelAccountId: z.string().uuid().optional() })
  .strict();

/** The manual campaign report periods and the days each one covers. */
export const MANUAL_CAMPAIGN_REPORT_DAYS = { '7d': 7, '1d': 1 } as const;
export type ManualCampaignReportPeriod = keyof typeof MANUAL_CAMPAIGN_REPORT_DAYS;

/**
 * A manual campaign report captures the ad center's own report for one exact
 * 7-day or 1-day range. The extension opens the report page itself, so the
 * start carries no page URL.
 */
const ManualCampaignReportScopeSchema = z
  .object({
    captureMode: z.literal('manual_report'),
    channelAccountId: z.string().uuid().optional(),
    period: z.enum(['7d', '1d']),
    startDate: CalendarDateSchema,
    endDate: CalendarDateSchema,
  })
  .strict()
  .refine(
    (scope) =>
      shiftBusinessDateKey(scope.startDate, MANUAL_CAMPAIGN_REPORT_DAYS[scope.period] - 1) ===
      scope.endDate,
    { message: 'the report range must cover exactly its period', path: ['endDate'] },
  );

function startRequest<
  TProducer extends CollectionStartProducer,
  TScope extends z.ZodTypeAny,
>(producer: TProducer, scope: TScope) {
  return z
    .object({
      action: z.literal(COLLECTION_START_ACTION),
      producer: z.literal(producer),
      idempotencyKey: z.string().uuid(),
      scope,
    })
    .strict();
}

export const CollectionStartRequestSchema = z.discriminatedUnion('producer', [
  startRequest(
    'advertising.ad_sync',
    z.union([ManualCampaignReportScopeSchema, AccountScopeSchema]),
  ),
  startRequest('advertising.ad_keyword', AccountScopeSchema),
  startRequest('advertising.profitability_import', z.object({}).strict()),
  startRequest(
    'dashboard.wing_sales',
    z
      .object({
        channelAccountId: z.string().uuid().optional(),
        startDate: CalendarDateSchema,
        endDate: CalendarDateSchema,
      })
      .strict()
      .refine((scope) => scope.startDate <= scope.endDate, {
        message: 'startDate must not be after endDate',
        path: ['endDate'],
      }),
  ),
]);
export type CollectionStartRequest = z.infer<typeof CollectionStartRequestSchema>;

/**
 * The extension answers once the start is decided, never when the collection
 * ends. The server attempt carries the collection's state from then on.
 * - `started`: an attempt was opened, or an idempotent replay returned it, and
 *   it runs inside the resource's turn.
 * - `running`: the same source and scope is already running; nothing new was
 *   opened.
 * - `refused`: another collection holds the resource; nothing was opened. The
 *   holder's Korean name includes a catalog import's store account when known.
 */
export const CollectionStartResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    success: z.literal(true),
    outcome: z.literal('started'),
    producer: CollectionStartProducerSchema,
    attemptId: AttemptIdSchema,
  }),
  z.object({
    success: z.literal(true),
    outcome: z.literal('running'),
    producer: CollectionStartProducerSchema,
    attemptId: AttemptIdSchema.nullable(),
  }),
  z.object({
    success: z.literal(true),
    outcome: z.literal('refused'),
    producer: CollectionStartProducerSchema,
    holder: z.object({
      producer: CollectionStartProducerSchema,
      name: z.string().trim().min(1).max(100),
      attemptId: AttemptIdSchema.nullable(),
    }),
    message: z.string().trim().min(1).max(300),
  }),
]);
export type CollectionStartResult = z.infer<typeof CollectionStartResultSchema>;
