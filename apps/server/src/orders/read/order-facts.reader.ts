import { Prisma } from '@prisma/client';
import { businessDateKey, datesInclusive, kstBusinessDate } from '../../common/kst';

export const ORDER_FACT_EXCLUDED_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

export interface OrderWindowInput {
  organizationId: string;
  from: Date;
  to: Date;
  excludedStatuses?: readonly string[];
}

export interface OrderWindowFacts {
  revenue: number | null;
  orderCount: number | null;
  quantity: number | null;
  observedAt: Date | null;
  observedTotals: {
    revenue: number;
    orderCount: number;
    quantity: number;
  } | null;
  requestedDates: string[];
  includedDates: string[];
  missingDates: string[];
  sourceCoverage: OrderSourceCoverageFacts[];
}

export interface OrderSourceCoverageFacts {
  sourceType: string;
  channelAccountId: string | null;
  mallKey: string | null;
  factDates: string[];
  includedDates: string[];
  missingDates: string[];
  observedAt: Date | null;
}

type OrderListPayload = Prisma.OrderGetPayload<{
  include: {
    channelAccount: { select: { channel: true } };
    lineItems: true;
  };
}>;

type OrderDetailPayload = Prisma.OrderGetPayload<{
  include: { lineItems: true };
}>;

export type OrderListFact = Omit<OrderListPayload, 'totalPrice'> & { totalPrice: number };
export type OrderDetailFact = Omit<OrderDetailPayload, 'totalPrice'> & { totalPrice: number };

export interface OrderListInput {
  organizationId: string;
  status: string | { in: string[] };
  from?: Date;
  to?: Date;
}

export interface OrderStatusCounts {
  total: number;
  byStatus: Record<string, number>;
}

export type OrderReturnFact = Prisma.OrderReturnGetPayload<{
  include: { lineItems: true };
}>;

export interface OrderReturnListInput {
  organizationId: string;
  type: string;
  from?: Date;
  to?: Date;
}

export interface DailyOrderFacts {
  day: string;
  revenue: number;
  orderCount: number;
  quantity: number;
}

export interface ListingOptionOrderFacts {
  orderId: string;
  channelAccountId: string;
  listingOptionId: string;
  revenue: number;
  quantity: number;
}

export interface OrderLineFact {
  orderId: string;
  channelAccountId: string;
  orderedAt: Date;
  businessDate: string;
  shippingPrice: number;
  lineItemId: string;
  listingOptionId: string | null;
  sku: string | null;
  productName: string;
  revenue: number;
  quantity: number;
}

export interface OrderLineWindowFacts {
  window: OrderWindowFacts;
  orders: readonly Readonly<{
    orderId: string;
    channelAccountId: string;
    orderedAt: Date;
    businessDate: string;
    shippingPrice: number;
    lines: readonly OrderLineFact[];
  }>[];
}

export interface RepurchaseOrderFact {
  orderId: string;
  receiverName: string | null;
  orderedAt: Date;
  revenue: number;
}

export interface OrderReturnWindowFacts {
  orderCount: number;
  /**
   * Returns of the window's orders, and returns with no order. `null` while
   * returns have no owner publication: nothing collects them or declares a
   * window of them observed, so the table's rows are not a count.
   */
  returnCount: number | null;
  orphanReturnCount: number | null;
}

type WindowRow = {
  revenue: bigint | null;
  orderCount: bigint;
  quantity: bigint | null;
  factObservedAt: Date | null;
};

type CoverageRun = Awaited<ReturnType<typeof readCompletedOrderCoverageRuns>>[number];

export async function readOrderListFacts(
  tx: Prisma.TransactionClient,
  input: OrderListInput,
): Promise<OrderListFact[]> {
  const rows = await tx.order.findMany({
    where: {
      ...completeOrderWhere(input.organizationId),
      status: input.status,
      ...((input.from || input.to) && {
        orderedAt: {
          ...(input.from && { gte: input.from }),
          ...(input.to && { lte: input.to }),
        },
      }),
    },
    include: {
      channelAccount: { select: { channel: true } },
      lineItems: {
        where: { organizationId: input.organizationId },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { orderedAt: 'desc' },
  });
  return rows.map((order) => ({
    ...order,
    totalPrice: order.lineItems.reduce((sum, line) => sum + line.totalPrice, 0),
  }));
}

export async function readOrderByIdFact(
  tx: Prisma.TransactionClient,
  organizationId: string,
  id: string,
): Promise<OrderDetailFact | null> {
  const order = await tx.order.findFirst({
    where: { ...completeOrderWhere(organizationId), id },
    include: {
      lineItems: {
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  return order
    ? {
        ...order,
        totalPrice: order.lineItems.reduce((sum, line) => sum + line.totalPrice, 0),
      }
    : null;
}

export async function readOrderIdentityFact(
  tx: Prisma.TransactionClient,
  organizationId: string,
  id: string,
): Promise<{ id: string } | null> {
  return tx.order.findFirst({
    where: { ...completeOrderWhere(organizationId), id },
    select: { id: true },
  });
}

export async function readOrderStatusCounts(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<OrderStatusCounts> {
  const rows = await tx.order.groupBy({
    by: ['status'],
    where: completeOrderWhere(organizationId),
    _count: true,
  });
  const byStatus = Object.fromEntries(
    rows.map((row) => [row.status, row._count]),
  );
  return {
    total: rows.reduce((sum, row) => sum + row._count, 0),
    byStatus,
  };
}

/**
 * How many orders completed source runs published for each channel account,
 * whatever their status: whether an account has collected orders at all.
 */
export async function readOrderCountsByChannelAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<Array<{ channelAccountId: string; orderCount: number }>> {
  const rows = await tx.order.groupBy({
    by: ['channelAccountId'],
    where: completeOrderWhere(organizationId),
    _count: { _all: true },
  });
  return rows.map((row) => ({
    channelAccountId: row.channelAccountId,
    orderCount: row._count._all,
  }));
}

export async function readOrderReturns(
  tx: Prisma.TransactionClient,
  input: OrderReturnListInput,
): Promise<OrderReturnFact[]> {
  return tx.orderReturn.findMany({
    where: {
      organizationId: input.organizationId,
      type: input.type,
      ...((input.from || input.to) && {
        requestedAt: {
          ...(input.from && { gte: input.from }),
          ...(input.to && { lte: input.to }),
        },
      }),
    },
    include: { lineItems: true },
    orderBy: { requestedAt: 'desc' },
  });
}

export async function readOrderReturnByIdFact(
  tx: Prisma.TransactionClient,
  organizationId: string,
  id: string,
): Promise<OrderReturnFact | null> {
  return tx.orderReturn.findFirst({
    where: { id, organizationId },
    include: { lineItems: true },
  });
}

export async function readOrderReturnStatusCounts(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<OrderStatusCounts> {
  const rows = await tx.orderReturn.groupBy({
    by: ['status'],
    where: { organizationId },
    _count: true,
  });
  const byStatus = Object.fromEntries(
    rows.map((row) => [row.status, row._count]),
  );
  return {
    total: rows.reduce((sum, row) => sum + row._count, 0),
    byStatus,
  };
}

/**
 * Reads canonical Order, OrderLineItem, and declared collection coverage facts.
 * The caller owns the transaction; this reader has no cache or lifecycle state.
 */
export async function readOrderWindowFacts(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
): Promise<OrderWindowFacts> {
  // No business date is requested, so there is no coverage to look for; an
  // unbounded coverage query would load every run and borrow their import time.
  if (isEmptyWindow(input)) return emptyOrderWindowFacts();
  const includedStatus = includedStatusPredicateSql(input.excludedStatuses);
  const rows = await tx.$queryRaw<WindowRow[]>(Prisma.sql`
    WITH order_facts AS (
      SELECT
        COUNT(DISTINCT o.id) FILTER (WHERE ${includedStatus})::bigint AS order_count,
        COALESCE(SUM(oli.total_price) FILTER (WHERE ${includedStatus}), 0)::bigint AS revenue,
        COALESCE(SUM(oli.quantity) FILTER (WHERE ${includedStatus}), 0)::bigint AS quantity,
        MAX(COALESCE(s.imported_at, o.updated_at)) AS observed_at
      FROM orders o
      LEFT JOIN order_line_items oli
        ON oli.order_id = o.id
       AND oli.organization_id = ${input.organizationId}::uuid
      INNER JOIN source_import_runs s
        ON s.id = o.source_import_run_id
       AND s.organization_id = o.organization_id
       AND s.status = 'completed'
      WHERE o.organization_id = ${input.organizationId}::uuid
        AND o.ordered_at >= ${input.from}
        AND o.ordered_at < ${input.to}
    )
    SELECT
      order_facts.revenue,
      order_facts.order_count AS "orderCount",
      order_facts.quantity,
      order_facts.observed_at AS "factObservedAt"
    FROM order_facts
  `);
  const coverageRuns = await readCompletedOrderCoverageRuns(tx, input);
  const row = rows[0];
  const coverage = buildOrderCoverage(input, coverageRuns);
  const orderCount = Number(row?.orderCount ?? 0n);
  const observedAt = latestDate(row?.factObservedAt ?? null, coverage.coverageObservedAt);
  const coverageFacts = {
    requestedDates: coverage.requestedDates,
    includedDates: coverage.includedDates,
    missingDates: coverage.missingDates,
    sourceCoverage: coverage.sourceCoverage,
  };
  const observedTotals = row?.factObservedAt
    ? {
        revenue: Number(row.revenue ?? 0n),
        orderCount,
        quantity: Number(row.quantity ?? 0n),
      }
    : null;
  if (coverage.requestedDates.length === 0 || coverage.missingDates.length > 0) {
    return {
      revenue: null,
      orderCount: null,
      quantity: null,
      observedAt,
      observedTotals,
      ...coverageFacts,
    };
  }
  return {
    revenue: Number(row?.revenue ?? 0n),
    orderCount,
    quantity: Number(row?.quantity ?? 0n),
    observedAt,
    observedTotals,
    ...coverageFacts,
  };
}

/**
 * Reads the admitted line facts and the owner's coverage verdict in one
 * caller-owned transaction. Consumers may retain observed rows for scoped
 * diagnostics, but a window scalar is publishable only when `window` is
 * complete.
 */
export async function readOrderLineWindowFacts(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
): Promise<OrderLineWindowFacts> {
  if (isEmptyWindow(input)) return { window: emptyOrderWindowFacts(), orders: [] };
  const [window, rows] = await Promise.all([
    readOrderWindowFacts(tx, input),
    tx.order.findMany({
      where: {
        ...completeOrderWhere(input.organizationId),
        orderedAt: { gte: input.from, lt: input.to },
        ...(input.excludedStatuses?.length
          ? { status: { notIn: [...input.excludedStatuses] } }
          : {}),
      },
      orderBy: [{ orderedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        channelAccountId: true,
        orderedAt: true,
        shippingPrice: true,
        lineItems: {
          where: { organizationId: input.organizationId },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            listingOptionId: true,
            sku: true,
            productName: true,
            totalPrice: true,
            quantity: true,
          },
        },
      },
    }),
  ]);
  return {
    window,
    orders: rows.map((order) => {
      const businessDate = businessDateKey(kstBusinessDate(order.orderedAt));
      return {
        orderId: order.id,
        channelAccountId: order.channelAccountId,
        orderedAt: order.orderedAt,
        businessDate,
        shippingPrice: order.shippingPrice,
        lines: order.lineItems.map((line) => ({
          orderId: order.id,
          channelAccountId: order.channelAccountId,
          orderedAt: order.orderedAt,
          businessDate,
          shippingPrice: order.shippingPrice,
          lineItemId: line.id,
          listingOptionId: line.listingOptionId,
          sku: line.sku,
          productName: line.productName,
          revenue: line.totalPrice,
          quantity: line.quantity,
        })),
      };
    }),
  };
}

export async function readDailyOrderFacts(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
): Promise<DailyOrderFacts[]> {
  type Row = { day: Date; revenue: bigint; orderCount: bigint; quantity: bigint };
  const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
    SELECT DATE_TRUNC('day', o.ordered_at AT TIME ZONE 'Asia/Seoul')::date AS day,
           COALESCE(SUM(oli.total_price), 0)::bigint AS revenue,
           COUNT(DISTINCT o.id)::bigint AS "orderCount",
           COALESCE(SUM(oli.quantity), 0)::bigint AS quantity
    FROM orders o
    LEFT JOIN order_line_items oli
      ON oli.order_id = o.id
     AND oli.organization_id = ${input.organizationId}::uuid
    WHERE o.organization_id = ${input.organizationId}::uuid
      AND o.ordered_at >= ${input.from}
      AND o.ordered_at < ${input.to}
      ${completeOrderFactSql(input.organizationId)}
      ${excludedStatusesSql(input.excludedStatuses)}
    GROUP BY 1
    ORDER BY 1
  `);
  return rows.map((row) => ({
    day: row.day.toISOString().slice(0, 10),
    revenue: Number(row.revenue),
    orderCount: Number(row.orderCount),
    quantity: Number(row.quantity),
  }));
}

export async function readListingOptionOrderFacts(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
): Promise<ListingOptionOrderFacts[]> {
  type Row = {
    orderId: string;
    channelAccountId: string;
    listingOptionId: string;
    revenue: bigint;
    quantity: bigint;
  };
  const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
    SELECT o.id AS "orderId", o.channel_account_id AS "channelAccountId",
           oli.listing_option_id AS "listingOptionId",
           SUM(oli.total_price)::bigint AS revenue,
           SUM(oli.quantity)::bigint AS quantity
    FROM orders o
    INNER JOIN order_line_items oli
      ON oli.order_id = o.id
     AND oli.organization_id = ${input.organizationId}::uuid
    WHERE o.organization_id = ${input.organizationId}::uuid
      AND o.ordered_at >= ${input.from}
      AND o.ordered_at < ${input.to}
      ${completeOrderFactSql(input.organizationId)}
      AND oli.listing_option_id IS NOT NULL
      ${excludedStatusesSql(input.excludedStatuses)}
    GROUP BY o.id, o.channel_account_id, oli.listing_option_id
  `);
  return rows.map((row) => ({
    orderId: row.orderId,
    channelAccountId: row.channelAccountId,
    listingOptionId: row.listingOptionId,
    revenue: Number(row.revenue),
    quantity: Number(row.quantity),
  }));
}

export async function readRepurchaseOrderFacts(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
): Promise<RepurchaseOrderFact[]> {
  type Row = RepurchaseOrderFact & { revenue: bigint };
  const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
    SELECT o.id AS "orderId", o.receiver_name AS "receiverName", o.ordered_at AS "orderedAt",
           COALESCE(SUM(oli.total_price), 0)::bigint AS revenue
    FROM orders o
    LEFT JOIN order_line_items oli
      ON oli.order_id = o.id
     AND oli.organization_id = ${input.organizationId}::uuid
    WHERE o.organization_id = ${input.organizationId}::uuid
      AND o.ordered_at >= ${input.from}
      AND o.ordered_at < ${input.to}
      ${completeOrderFactSql(input.organizationId)}
      ${excludedStatusesSql(input.excludedStatuses)}
    GROUP BY o.id
  `);
  return rows.map((row) => ({ ...row, revenue: Number(row.revenue) }));
}

export async function readObservedOrderBounds(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<{ from: Date; to: Date } | null> {
  const rows = await tx.$queryRaw<Array<{ from: Date | null; to: Date | null }>>(Prisma.sql`
    SELECT
      DATE_TRUNC('day', MIN(ordered_at) AT TIME ZONE 'Asia/Seoul')
        AT TIME ZONE 'Asia/Seoul' AS "from",
      (DATE_TRUNC('day', MAX(ordered_at) AT TIME ZONE 'Asia/Seoul') + INTERVAL '1 day')
        AT TIME ZONE 'Asia/Seoul' AS "to"
    FROM orders
    WHERE organization_id = ${organizationId}::uuid
      AND EXISTS (
        SELECT 1 FROM source_import_runs s
        WHERE s.id = orders.source_import_run_id
          AND s.organization_id = ${organizationId}::uuid
          AND s.status = 'completed'
      )
  `);
  const row = rows[0];
  return row?.from && row.to ? { from: row.from, to: row.to } : null;
}

/**
 * How many orders a completed source run published for the organization,
 * whatever their status: whether a collection published orders at all, not
 * what they earned.
 */
export async function readObservedOrderCount(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  const [row] = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM orders
    WHERE organization_id = ${organizationId}::uuid
      AND EXISTS (
        SELECT 1 FROM source_import_runs s
        WHERE s.id = orders.source_import_run_id
          AND s.organization_id = ${organizationId}::uuid
          AND s.status = 'completed'
      )
  `);
  return Number(row?.count ?? 0n);
}

/** One line of an order a completed source run published, without window facts. */
export interface PublishedOrderLineFact {
  orderId: string;
  lineItemId: string;
  listingOptionId: string | null;
  revenue: number;
  quantity: number;
}

/**
 * Every line of every order a completed source run published for the
 * organization, whatever its date. It declares no window and reads no
 * coverage, so an all-history consumer can issue it on the client rather than
 * inside an interactive transaction; nothing it returns is a window total.
 */
export async function readPublishedOrderLines(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; excludedStatuses?: readonly string[] },
): Promise<PublishedOrderLineFact[]> {
  const rows = await tx.orderLineItem.findMany({
    where: {
      organizationId: input.organizationId,
      order: {
        ...completeOrderWhere(input.organizationId),
        ...(input.excludedStatuses?.length
          ? { status: { notIn: [...input.excludedStatuses] } }
          : {}),
      },
    },
    orderBy: [{ orderId: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      orderId: true,
      listingOptionId: true,
      totalPrice: true,
      quantity: true,
    },
  });
  return rows.map((row) => ({
    orderId: row.orderId,
    lineItemId: row.id,
    listingOptionId: row.listingOptionId,
    revenue: row.totalPrice,
    quantity: row.quantity,
  }));
}

/**
 * The collected orders placed inside `[from, to)`, and the window's returns.
 * Returns have no owner publication (ADR-0009): no source attempt collects
 * them and no coverage declares a window of them observed, so neither an empty
 * nor a populated return table is a count. Both return counts stay `null`
 * until a return source publishes coverage (ADR-0006).
 */
export async function readOrderReturnWindowFacts(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
): Promise<OrderReturnWindowFacts> {
  const [row] = await tx.$queryRaw<Array<{ orderCount: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "orderCount"
    FROM orders o
    WHERE o.organization_id = ${input.organizationId}::uuid
      ${completeOrderFactSql(input.organizationId)}
      AND o.ordered_at >= ${input.from} AND o.ordered_at < ${input.to}
  `);
  return {
    orderCount: Number(row.orderCount),
    returnCount: null,
    orphanReturnCount: null,
  };
}

export async function readOrderReturnReasonFacts(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
): Promise<Array<{ reason: string; count: number }>> {
  const rows = await tx.$queryRaw<Array<{ reason: string; count: bigint }>>(Prisma.sql`
    SELECT reason, COUNT(*)::bigint AS count
    FROM order_returns
    WHERE organization_id = ${input.organizationId}::uuid
      AND requested_at >= ${input.from} AND requested_at < ${input.to}
    GROUP BY reason
  `);
  return rows.map((row) => ({ reason: row.reason, count: Number(row.count) }));
}

export async function readOrderReturnFaultFacts(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
): Promise<Array<{ faultBy: string; count: number }>> {
  const rows = await tx.$queryRaw<Array<{ faultBy: string; count: bigint }>>(Prisma.sql`
    SELECT fault_by AS "faultBy", COUNT(*)::bigint AS count
    FROM order_returns
    WHERE organization_id = ${input.organizationId}::uuid
      AND requested_at >= ${input.from} AND requested_at < ${input.to}
    GROUP BY fault_by
  `);
  return rows.map((row) => ({ faultBy: row.faultBy, count: Number(row.count) }));
}

export async function readOrderStatusCount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  status: string,
): Promise<number> {
  const [row] = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM orders
    WHERE organization_id = ${organizationId}::uuid AND status = ${status}
      AND EXISTS (
        SELECT 1 FROM source_import_runs s
        WHERE s.id = orders.source_import_run_id
          AND s.organization_id = ${organizationId}::uuid
          AND s.status = 'completed'
      )
  `);
  return Number(row?.count ?? 0n);
}

export async function readOrderReturnStatusCount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  status: string,
): Promise<number> {
  const [row] = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM order_returns
    WHERE organization_id = ${organizationId}::uuid AND status = ${status}
  `);
  return Number(row?.count ?? 0n);
}

function excludedStatusesSql(statuses: readonly string[] | undefined): Prisma.Sql {
  if (!statuses || statuses.length === 0) return Prisma.empty;
  return Prisma.sql`AND o.status NOT IN (${Prisma.join(statuses)})`;
}

function includedStatusPredicateSql(statuses: readonly string[] | undefined): Prisma.Sql {
  if (!statuses || statuses.length === 0) return Prisma.sql`TRUE`;
  return Prisma.sql`o.status NOT IN (${Prisma.join(statuses)})`;
}

function completeOrderFactSql(organizationId: string): Prisma.Sql {
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM source_import_runs completed_source
    WHERE completed_source.id = o.source_import_run_id
      AND completed_source.organization_id = ${organizationId}::uuid
      AND completed_source.status = 'completed'
  )`;
}

function isEmptyWindow(input: Pick<OrderWindowInput, 'from' | 'to'>): boolean {
  return input.to.getTime() <= input.from.getTime();
}

/** A window with no business date: nothing requested, nothing observed. */
function emptyOrderWindowFacts(): OrderWindowFacts {
  return {
    revenue: null,
    orderCount: null,
    quantity: null,
    observedAt: null,
    observedTotals: null,
    requestedDates: [],
    includedDates: [],
    missingDates: [],
    sourceCoverage: [],
  };
}

function completeOrderWhere(organizationId: string): Prisma.OrderWhereInput {
  return {
    organizationId,
    sourceImportRunId: { not: null },
    sourceImportRun: {
      is: { organizationId, status: 'completed' },
    },
  };
}

async function readCompletedOrderCoverageRuns(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
) {
  const requestedDates = enumerateKstBusinessDates(input.from, input.to);
  const firstDate = requestedDates[0];
  const lastDate = requestedDates.at(-1);
  return tx.sourceImportRun.findMany({
    where: {
      organizationId: input.organizationId,
      status: 'completed',
      OR: [
        {
          orders: {
            some: {
              organizationId: input.organizationId,
              orderedAt: { gte: input.from, lt: input.to },
            },
          },
        },
        {
          sourceType: 'order_collection_mall',
          channelAccountId: { not: null },
          channelAccount: {
            is: {
              organizationId: input.organizationId,
              channel: 'order_collection',
            },
          },
          coverageStartDate: lastDate ? { not: null, lte: new Date(lastDate) } : { not: null },
          coverageEndDate: firstDate ? { not: null, gte: new Date(firstDate) } : { not: null },
        },
      ],
    },
    select: {
      sourceType: true,
      channelAccountId: true,
      importedAt: true,
      updatedAt: true,
      createdAt: true,
      coverageStartDate: true,
      coverageEndDate: true,
      channelAccount: {
        select: { channel: true, externalAccountId: true },
      },
      orders: {
        where: {
          organizationId: input.organizationId,
          orderedAt: { gte: input.from, lt: input.to },
        },
        select: { orderedAt: true },
      },
    },
  });
}

function buildOrderCoverage(
  input: OrderWindowInput,
  runs: readonly CoverageRun[],
): Pick<OrderWindowFacts, 'requestedDates' | 'includedDates' | 'missingDates' | 'sourceCoverage'>
  & { coverageObservedAt: Date | null } {
  const requestedDates = enumerateKstBusinessDates(input.from, input.to);
  const requested = new Set(requestedDates);
  const bySource = new Map<string, {
    sourceType: string;
    channelAccountId: string | null;
    mallKey: string | null;
    factDates: Set<string>;
    included: Set<string>;
    observedAt: Date | null;
  }>();

  for (const run of runs) {
    const sourceKey = `${run.sourceType}\u0000${run.channelAccountId ?? ''}`;
    const source = bySource.get(sourceKey) ?? {
      sourceType: run.sourceType,
      channelAccountId: run.channelAccountId,
      mallKey: run.channelAccount?.channel === 'order_collection'
        ? run.channelAccount.externalAccountId
        : null,
      factDates: new Set<string>(),
      included: new Set<string>(),
      observedAt: null,
    };
    for (const order of run.orders) {
      const date = businessDateKey(kstBusinessDate(order.orderedAt));
      if (requested.has(date)) source.factDates.add(date);
    }
    if (
      run.sourceType === 'order_collection_mall'
      && run.channelAccountId
      && run.channelAccount?.channel === 'order_collection'
      && run.coverageStartDate
      && run.coverageEndDate
    ) {
      for (const date of datesInclusive(
        run.coverageStartDate,
        run.coverageEndDate,
      ).map(businessDateKey)) {
        if (requested.has(date)) source.included.add(date);
      }
    }
    source.observedAt = latestDate(
      source.observedAt,
      run.importedAt ?? run.updatedAt ?? run.createdAt,
    );
    bySource.set(sourceKey, source);
  }

  const sources = [...bySource.values()];
  const includedDates = sources.length === 0
    ? []
    : requestedDates.filter((date) => sources.every((source) => source.included.has(date)));
  const included = new Set(includedDates);
  const missingDates = requestedDates.filter((date) => !included.has(date));
  const sourceCoverage = [...bySource.values()]
    .map((source) => ({
      sourceType: source.sourceType,
      channelAccountId: source.channelAccountId,
      mallKey: source.mallKey,
      factDates: requestedDates.filter((date) => source.factDates.has(date)),
      includedDates: requestedDates.filter((date) => source.included.has(date)),
      missingDates: requestedDates.filter((date) => !source.included.has(date)),
      observedAt: source.observedAt,
    }))
    .sort((left, right) =>
      `${left.sourceType}\u0000${left.channelAccountId ?? ''}`
        .localeCompare(`${right.sourceType}\u0000${right.channelAccountId ?? ''}`));

  return {
    requestedDates,
    includedDates,
    missingDates,
    sourceCoverage,
    coverageObservedAt: sourceCoverage.reduce<Date | null>(
      (latest, source) => latestDate(latest, source.observedAt),
      null,
    ),
  };
}

function enumerateKstBusinessDates(from: Date, to: Date): string[] {
  if (to <= from) return [];
  return datesInclusive(
    kstBusinessDate(from),
    kstBusinessDate(new Date(to.getTime() - 1)),
  ).map(businessDateKey);
}

function latestDate(first: Date | null, second: Date | null): Date | null {
  if (!first) return second;
  if (!second) return first;
  return first > second ? first : second;
}
