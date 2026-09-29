import { MALL_ORDERS_KIND, MallOrdersResultSchema } from '@kiditem/shared/orders-operations';
import { readSucceededOperationWindows } from '../../../../../common/operation/transaction/succeeded-operation-windows';
import { readLatestSucceededFinishedAt } from '../../../../../common/operation/transaction/operation-finished-at';
import { Prisma } from '@prisma/client';
import {
  findChannel,
  findMallChannel,
  MALL_CHANNELS,
} from '@kiditem/shared/channel-registry';
import { businessDateKey, datesInclusive, kstBusinessDate } from '../../../../../common/kst';
import { ownerTransaction } from '../../../../../prisma/owner-transaction';
import type { ChannelAccountPort } from '../../../../../channels/application/port/in/account/channel-account.port';

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
    lineItems: true;
  };
}>;

type OrderDetailPayload = Prisma.OrderGetPayload<{
  include: { lineItems: true };
}>;

export type OrderListFact = Omit<OrderListPayload, 'totalPrice'> & {
  totalPrice: number;
  channelAccount: { channel: string } | null;
};
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

type WindowRow = {
  revenue: bigint | null;
  orderCount: bigint;
  quantity: bigint | null;
  publishedCount: bigint;
  operationIds: string[] | null;
};

type CoverageRun = Awaited<ReturnType<typeof readMallOrderCoverage>>[number];
type AccountFacts = Pick<ChannelAccountPort, 'findByIds'>;

export async function readOrderListFacts(
  tx: Prisma.TransactionClient,
  input: OrderListInput,
  accounts: AccountFacts,
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
      lineItems: {
        where: { organizationId: input.organizationId },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { orderedAt: 'desc' },
  });
  const accountFacts = await accounts.findByIds(ownerTransaction(tx), {
    organizationId: input.organizationId,
    accountIds: [...new Set(rows.map((order) => order.channelAccountId))],
  });
  const accountById = new Map(accountFacts.map((account) => [account.id, account]));
  return rows.map((order) => ({
    ...order,
    channelAccount: accountById.get(order.channelAccountId)
      ? { channel: accountById.get(order.channelAccountId)!.channel }
      : null,
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
 * How many orders operations published for each channel account,
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

/**
 * Reads canonical Order, OrderLineItem, and declared collection coverage facts.
 * The caller owns the transaction; this reader has no cache or lifecycle state.
 */
export async function readOrderWindowFacts(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
  accounts: AccountFacts,
): Promise<OrderWindowFacts> {
  // No business date is requested, so there is no coverage to look for; an
  // unbounded coverage query would load every operation and borrow its finish time.
  if (isEmptyWindow(input)) return emptyOrderWindowFacts();
  const includedStatus = includedStatusPredicateSql(input.excludedStatuses);
  const rows = await tx.$queryRaw<WindowRow[]>(Prisma.sql`
    WITH order_facts AS (
      SELECT
        COUNT(DISTINCT o.id) FILTER (WHERE ${includedStatus})::bigint AS order_count,
        COALESCE(SUM(oli.total_price) FILTER (WHERE ${includedStatus}), 0)::bigint AS revenue,
        COALESCE(SUM(oli.quantity) FILTER (WHERE ${includedStatus}), 0)::bigint AS quantity,
        COUNT(DISTINCT o.id)::bigint AS published_count,
        ARRAY_AGG(DISTINCT o.operation_id::text) AS operation_ids
      FROM orders o
      LEFT JOIN order_line_items oli
        ON oli.order_id = o.id
       AND oli.organization_id = ${input.organizationId}::uuid
      WHERE o.organization_id = ${input.organizationId}::uuid
        AND o.operation_id IS NOT NULL
        AND o.ordered_at >= ${input.from}
        AND o.ordered_at < ${input.to}
    )
    SELECT
      order_facts.revenue,
      order_facts.order_count AS "orderCount",
      order_facts.quantity,
      order_facts.published_count AS "publishedCount",
      order_facts.operation_ids AS "operationIds"
    FROM order_facts
  `);
  const coverageRuns = await readMallOrderCoverage(tx, input, accounts);
  const row = rows[0];
  const published = Number(row?.publishedCount ?? 0n) > 0;
  // 사실을 관측한 때는 그 주문을 쓴 실행이 끝난 때다(ADR-0025).
  const factObservedAt = published
    ? await readLatestSucceededFinishedAt(tx, { organizationId: input.organizationId, ids: row?.operationIds ?? [] })
    : null;
  const coverage = buildOrderCoverage(input, coverageRuns);
  const orderCount = Number(row?.orderCount ?? 0n);
  const observedAt = latestDate(factObservedAt, coverage.coverageObservedAt);
  const coverageFacts = {
    requestedDates: coverage.requestedDates,
    includedDates: coverage.includedDates,
    missingDates: coverage.missingDates,
    sourceCoverage: coverage.sourceCoverage,
  };
  const observedTotals = published
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
  accounts: AccountFacts,
): Promise<OrderLineWindowFacts> {
  if (isEmptyWindow(input)) return { window: emptyOrderWindowFacts(), orders: [] };
  const [window, rows] = await Promise.all([
    readOrderWindowFacts(tx, input, accounts),
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
      ${COMPLETE_ORDER_FACT_SQL}
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
      ${COMPLETE_ORDER_FACT_SQL}
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
      ${COMPLETE_ORDER_FACT_SQL}
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
      AND operation_id IS NOT NULL
  `);
  const row = rows[0];
  return row?.from && row.to ? { from: row.from, to: row.to } : null;
}

/**
 * How many orders an operation published for the organization,
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
      AND operation_id IS NOT NULL
  `);
  return Number(row?.count ?? 0n);
}

/** One line of an order an operation published, without window facts. */
export interface PublishedOrderLineFact {
  orderId: string;
  lineItemId: string;
  listingOptionId: string | null;
  revenue: number;
  quantity: number;
}

/**
 * Every line of every order an operation published for the
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

export async function readOrderStatusCount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  status: string,
): Promise<number> {
  const [row] = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM orders
    WHERE organization_id = ${organizationId}::uuid AND status = ${status}
      AND operation_id IS NOT NULL
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

/** 실행이 쓴 주문만 사실이다 — 변환은 성공한 실행에서만 돈다(KID-359, KID-365). */
const COMPLETE_ORDER_FACT_SQL = Prisma.sql`AND o.operation_id IS NOT NULL`;

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

/**
 * 실행이 쓴 주문: 성공한 directship·로켓 실행을 변환한 주문(`operationId`, KID-359 — 변환은 성공한 실행에서만 돈다).
 * 옛 run이 쓴 주문은 사실이 아니다(KID-365, ADR-0010: 옛 run 행은 이관 없이 버린다).
 */
function completeOrderWhere(organizationId: string): Prisma.OrderWhereInput {
  return { organizationId, operationId: { not: null } };
}

/**
 * 창 안의 업무일을 확인한 몰 주문 수집과 그 몰 계정의 채널. 몰 적용 범위는 성공한 `orders.mall_orders` 실행의
 * `result.coverage`뿐이다(KID-365).
 */
async function readMallOrderCoverage(
  tx: Prisma.TransactionClient,
  input: OrderWindowInput,
  accounts: AccountFacts,
) {
  const requestedDates = enumerateKstBusinessDates(input.from, input.to);
  const firstDate = requestedDates[0];
  const lastDate = requestedDates.at(-1);
  const operationRuns = firstDate && lastDate
    ? await readMallOrderCoverageOperations(tx, input.organizationId, firstDate, lastDate)
    : [];
  const accountFacts = await accounts.findByIds(ownerTransaction(tx), {
    organizationId: input.organizationId,
    accountIds: [...new Set(operationRuns.map((run) => run.channelAccountId))],
  });
  const accountById = new Map(accountFacts.map((account) => [account.id, account]));
  return operationRuns.map((run) => ({
    ...run,
    channelAccount: { channel: accountById.get(run.channelAccountId)?.channel ?? null },
  }));
}

/**
 * 실행 계약으로 옮긴 몰 주문 수집(`orders.mall_orders`, KID-359)이 확인한 기간: 성공 실행의 `result.coverage`, 계정은
 * plan에서, 관측 시각은 끝난 시각. 실행 표는 실행 계약 모듈의 트랜잭션 리더로만 읽는다(ADR-0025).
 */
async function readMallOrderCoverageOperations(
  tx: Prisma.TransactionClient,
  organizationId: string,
  firstDate: string,
  lastDate: string,
) {
  const operations = await readSucceededOperationWindows(tx, { organizationId, kinds: [MALL_ORDERS_KIND], firstDate, lastDate });
  return operations.flatMap((operation) => {
    const result = MallOrdersResultSchema.safeParse(operation.result);
    const plan = operation.plan && typeof operation.plan === 'object' && !Array.isArray(operation.plan) ? operation.plan as Prisma.JsonObject : null;
    const channelAccountId = typeof plan?.channelAccountId === 'string' ? plan.channelAccountId : null;
    if (!result.success || !result.data.coverage || !channelAccountId) return [];
    return [{
      channelAccountId,
      mallKey: result.data.mallKey,
      observedAt: operation.finishedAt ?? operation.startedAt,
      coverageStartDate: new Date(`${result.data.coverage.startDate}T00:00:00.000Z`),
      coverageEndDate: new Date(`${result.data.coverage.endDate}T00:00:00.000Z`),
    }];
  });
}

/** 몰 적용 범위의 소스 칸 이름(웹이 읽는 옛 이름을 그대로 둔다). */
const MALL_COVERAGE_SOURCE_TYPE = 'order_collection_mall';

function buildOrderCoverage(
  input: OrderWindowInput,
  runs: readonly CoverageRun[],
): Pick<OrderWindowFacts, 'requestedDates' | 'includedDates' | 'missingDates' | 'sourceCoverage'>
  & { coverageObservedAt: Date | null } {
  const requestedDates = enumerateKstBusinessDates(input.from, input.to);
  const requested = new Set(requestedDates);
  const byAccount = new Map<string, {
    channelAccountId: string;
    mallKey: string;
    included: Set<string>;
    observedAt: Date | null;
  }>();

  for (const run of runs) {
    // 몰 행의 채널이 곧 몰 키이고(ADR-0012), 레지스트리로 되찾는 것은 공유 마켓 행뿐이다.
    const mallKey = findMallChannel(run.mallKey)?.key
      ?? (run.channelAccount.channel ? mallKeyForAccountChannel(run.channelAccount.channel) : run.mallKey);
    const source = byAccount.get(run.channelAccountId) ?? {
      channelAccountId: run.channelAccountId,
      mallKey,
      included: new Set<string>(),
      observedAt: null,
    };
    for (const date of datesInclusive(run.coverageStartDate, run.coverageEndDate).map(businessDateKey)) {
      if (requested.has(date)) source.included.add(date);
    }
    source.observedAt = latestDate(source.observedAt, run.observedAt);
    byAccount.set(run.channelAccountId, source);
  }

  const sources = [...byAccount.values()];
  const includedDates = sources.length === 0
    ? []
    : requestedDates.filter((date) => sources.every((source) => source.included.has(date)));
  const included = new Set(includedDates);
  const missingDates = requestedDates.filter((date) => !included.has(date));
  const sourceCoverage = sources
    .map((source) => ({
      sourceType: MALL_COVERAGE_SOURCE_TYPE,
      channelAccountId: source.channelAccountId,
      mallKey: source.mallKey,
      // 몰 주문 수집은 주문 행을 쓰지 않는다(셀피아 양식으로 변환) — 몰 칸의 사실 날짜는 없다.
      factDates: [],
      includedDates: requestedDates.filter((date) => source.included.has(date)),
      missingDates: requestedDates.filter((date) => !source.included.has(date)),
      observedAt: source.observedAt,
    }))
    .sort((left, right) => left.channelAccountId.localeCompare(right.channelAccountId));

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

function mallKeyForAccountChannel(channel: string): string {
  return MALL_CHANNELS.find((mall) => (findChannel(mall.key)?.sharedAccountChannel ?? mall.key) === channel)
    ?.key ?? channel;
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
