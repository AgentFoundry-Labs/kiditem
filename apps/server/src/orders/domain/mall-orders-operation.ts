import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  isMallOrderOperationMall,
  MALL_ORDERS_CHUNK_KIND,
  MALL_ORDERS_CONTINUATION_CHUNK_KIND,
  MALL_ORDERS_ORDER_NUMBERS_MAX,
  MallOrdersCollectionModeSchema,
  MallOrdersScopeSchema,
  MallOrdersSelectionModeSchema,
  type MallOrderOperationMall,
  type MallOrdersScope,
} from '@kiditem/shared/orders-operations';
import { z } from 'zod';
import { canonicalOwnerInputJson } from '../../common/owner-idempotency-key';

/**
 * 몰 주문 수집(`orders.mall_orders`, KID-359 H3)의 plan — 옛 attempt plan의 칸 그대로(몰 키·이름·계정·수집일·
 * 수집 방식·자동 선택과 본 행 키). owner가 begin에서 Channels 몰 식별로 계정을 확인한 뒤 적는다.
 */
export const MallOrdersPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  mallKey: z.string().refine(isMallOrderOperationMall, '몰 주문 kind로 옮긴 몰이 아닙니다'),
  mallName: z.string().min(1),
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  collectionMode: MallOrdersCollectionModeSchema,
  selectionMode: MallOrdersSelectionModeSchema.optional(),
  seenRowKeys: z.array(z.string()).optional(),
}).strict();
export type MallOrdersPlan = z.infer<typeof MallOrdersPlanSchema> & { mallKey: MallOrderOperationMall };

/** 보관할 캡처 한 벌과 그 원소 수. 0이면 "걷었는데 없었다" — 변환하지 않고 주문 수 0이다. */
export interface MallOrdersCapture {
  source: { bytes: Buffer; fileName: string | null; contentType: string };
  captured: number;
  /** 고른 행의 서로 다른 주문번호(알 수 있는 몰만). */
  orderNumbers?: string[];
  /** 화면 표에 개인정보가 가려진 칸이 있었다(아이스크림몰). */
  masked?: boolean;
}

/** 서로 다른 주문번호, 처음 나온 순서로, 상한까지. */
function distinctOrderNumbers(values: readonly unknown[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    if (text && text.length <= 200) out.add(text);
    if (out.size >= MALL_ORDERS_ORDER_NUMBERS_MAX) break;
  }
  return [...out];
}

/**
 * 몰마다 청크를 옛 변환 라우트가 받던 본문으로 모으는 규칙. 청크 원소 모양은 몰의 확장 수집기와 같다.
 * 여기 없는 몰은 아직 옮기지 않은 몰이라 plan이 거절한다(1차 몰을 하나씩 옮긴다).
 */
interface MallCaptureRule {
  /** `continuation` 청크를 받는 몰(아이스크림몰). */
  continuation?: z.ZodTypeAny;
  assemble(input: { rows: unknown[]; continuation: unknown | null; plan: MallOrdersPlan }): MallOrdersCapture;
}

const OrderObjectSchema = z.record(z.string(), z.unknown());

/** 목록 하나를 JSON 본문의 한 칸으로 보관하는 몰(키드키즈 `orders`, 아트공구 `rows`). 옛 서버 변환 본문과 같다. */
function jsonList(field: string, item: z.ZodTypeAny, orderNumberField: string): MallCaptureRule {
  return {
    assemble({ rows }) {
      const parsed = item.array().safeParse(rows);
      if (!parsed.success) throw invalid('invalid_order_rows', { errors: issues(parsed.error) });
      const items = parsed.data as Array<Record<string, unknown>>;
      return {
        source: { bytes: Buffer.from(canonicalOwnerInputJson({ [field]: items }), 'utf8'), fileName: null, contentType: 'application/json' },
        captured: items.length,
        orderNumbers: distinctOrderNumbers(items.map((entry) => entry[orderNumberField])),
      };
    },
  };
}

const FilePartSchema = z.object({
  fileName: z.string().min(1).max(240),
  part: z.number().int().nonnegative(),
  parts: z.number().int().min(1).max(64),
  base64: z.string().regex(/^[A-Za-z0-9+/=]*$/),
}).strict();

/** 조각(base64)을 순번대로 이어 파일 하나로. 조각이 없으면 null — "주문 없음"을 확인한 날이다. */
function joinedFile(rows: unknown[]): { bytes: Buffer; fileName: string } | null {
  const parsed = FilePartSchema.array().safeParse(rows);
  if (!parsed.success) throw invalid('invalid_order_rows', { errors: issues(parsed.error) });
  const parts = [...parsed.data].sort((a, b) => a.part - b.part);
  if (parts.length === 0) return null;
  const [first] = parts;
  const complete = parts.every((part, index) => part.part === index && part.parts === first!.parts && part.fileName === first!.fileName)
    && parts.length === first!.parts;
  if (!complete) throw invalid('incomplete_file_parts', { parts: parts.map((part) => [part.part, part.parts]) });
  return { bytes: Buffer.from(parts.map((part) => part.base64).join(''), 'base64'), fileName: first!.fileName };
}

/**
 * 몰이 내려준 파일 하나를 조각(base64, 청크 1MiB 안)으로 받아 이어 붙여 파일 캡처로 보관하는 몰(도매꾹 주문 CSV는
 * EUC-KR 원본 바이트 그대로 — 변환기가 디코딩한다, 롯데ON·보리보리·티쳐몰·GS샵·올웨이즈 엑셀). `contentType`은 옛
 * 확장 변환 요청(`order-collection-server-converter.js` FILE_MIME)의 값이다. 조각이 없으면 "주문 없음"을 확인한 날이다.
 */
function filePart(contentType: string): MallCaptureRule {
  return {
    assemble({ rows }) {
      const file = joinedFile(rows);
      if (!file) return { source: { bytes: Buffer.alloc(0), fileName: null, contentType }, captured: 0 };
      return { source: { bytes: file.bytes, fileName: file.fileName, contentType }, captured: 1 };
    },
  };
}

/**
 * 꼬망세: 엑셀 조각을 이어 옛 변환 본문 `{xlsxBase64, date}`(JSON, 옛 확장 `jsonPayload` kkomangse)로 보관한다. `date`는
 * plan의 수집일 — 변환기가 그날 주문만 거른다.
 */
const kkomangseRule: MallCaptureRule = {
  assemble({ rows, plan }) {
    const file = joinedFile(rows);
    if (!file) return { source: { bytes: Buffer.alloc(0), fileName: null, contentType: 'application/json' }, captured: 0 };
    const payload = { xlsxBase64: file.bytes.toString('base64'), date: plan.collectionDate };
    return {
      source: { bytes: Buffer.from(canonicalOwnerInputJson(payload), 'utf8'), fileName: null, contentType: 'application/json' },
      captured: 1,
    };
  },
};

/** 아이스크림몰 행 하나를 가리는 키 — 칸마다 공백을 걷어 U+001F로 잇는다(웹 `order-detect.ts`의 본 행 키와 같다). */
const ICECREAM_ROW_KEY_SEPARATOR = '\u001f';
const IcecreamRowSchema = z.array(z.string());
const IcecreamContinuationSchema = z.object({ headers: z.array(z.string()).min(1), masked: z.boolean().optional() }).strict();

export function icecreamRowKey(row: readonly string[]): string {
  return row.map((cell) => String(cell ?? '').trim()).join(ICECREAM_ROW_KEY_SEPARATOR);
}

/**
 * 아이스크림몰: 배송목록 행(`order_rows`, 칸 배열)과 머리글(`continuation` 한 장)을 옛 서버 변환 본문 그대로 모은다
 * (옛 확장 `order-collection-server-converter.js`의 `icecreamPayload`). 자동 선택이면 plan의 본 행 키를 빼고 고른 행만
 * 변환하고, 원본 전체(`originalRows`)는 배송 색인·다음 자동 선택을 위해 함께 보관한다.
 */
const icecreamRule: MallCaptureRule = {
  continuation: IcecreamContinuationSchema,
  assemble({ rows, continuation, plan }) {
    const parsed = IcecreamRowSchema.array().safeParse(rows);
    if (!parsed.success) throw invalid('invalid_order_rows', { errors: issues(parsed.error) });
    const originalRows = parsed.data;
    const stored = continuation as z.infer<typeof IcecreamContinuationSchema> | null;
    const headers = stored?.headers ?? null;
    if (originalRows.length > 0 && !headers) throw invalid('continuation_missing', { mallKey: plan.mallKey });
    const seen = new Set(plan.seenRowKeys ?? []);
    const automatic = plan.selectionMode === 'automatic';
    const keys = originalRows.map(icecreamRowKey);
    const selected = originalRows.flatMap((row, index) => (automatic && seen.has(keys[index]!) ? [] : [{ row, key: keys[index]! }]));
    const payload = {
      headers: headers ?? [],
      rows: selected.map((entry) => entry.row),
      sourceRows: originalRows,
      originalRows,
      selectionMode: automatic ? 'automatic' : 'manual',
      seenRowKeys: [...seen],
      selectedRows: selected.map((entry) => entry.row),
      selectedRowKeys: selected.map((entry) => entry.key),
    };
    const orderNumberIndex = headers?.indexOf('주문번호') ?? -1;
    return {
      source: { bytes: Buffer.from(canonicalOwnerInputJson(payload), 'utf8'), fileName: null, contentType: 'application/json' },
      captured: selected.length,
      orderNumbers: orderNumberIndex < 0 ? [] : distinctOrderNumbers(selected.map((entry) => entry.row[orderNumberIndex])),
      masked: stored?.masked === true,
    };
  },
};

/** 화면이 이어 쓰는 아이스크림몰 정보(배송 색인·본 행 키). 보관 캡처에서 읽는다. */
export interface IcecreamContinuation {
  mallKey: 'icecream-mall';
  headers: string[];
  originalRows: string[][];
  selectedRows: string[][];
  selectedRowKeys: string[];
  selectionMode: 'manual' | 'automatic';
  sourceRows: number;
}

const StoredIcecreamCaptureSchema = z.object({
  headers: z.array(z.string()),
  originalRows: z.array(z.array(z.string())),
  selectedRows: z.array(z.array(z.string())),
  selectedRowKeys: z.array(z.string()),
  selectionMode: z.enum(['manual', 'automatic']),
}).passthrough().refine((value) => value.selectedRows.length === value.selectedRowKeys.length);

/** 보관 캡처 → continuation. 아이스크림몰이 아니면 continuation_unsupported, 읽을 수 없으면 continuation_unavailable. */
export function icecreamContinuation(mallKey: string, bytes: Buffer): IcecreamContinuation {
  if (mallKey !== 'icecream-mall') throw invalid('continuation_unsupported', { mallKey });
  let value: unknown = null;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    value = null;
  }
  const parsed = StoredIcecreamCaptureSchema.safeParse(value);
  if (!parsed.success) throw invalid('continuation_unavailable', { mallKey });
  const capture = parsed.data;
  return {
    mallKey: 'icecream-mall',
    headers: capture.headers,
    originalRows: capture.originalRows,
    selectedRows: capture.selectedRows,
    selectedRowKeys: capture.selectedRowKeys,
    selectionMode: capture.selectionMode,
    sourceRows: capture.selectedRows.length,
  };
}

const MALL_CAPTURE_RULES: Partial<Record<MallOrderOperationMall, MallCaptureRule>> = {
  kidkids: jsonList('orders', OrderObjectSchema.and(z.object({ items: z.array(z.unknown()) })), 'om'),
  art09: jsonList('rows', OrderObjectSchema.and(z.object({ orderId: z.string() })), 'orderId'),
  domeggook: filePart('text/csv'),
  kkomangse: kkomangseRule,
  'icecream-mall': icecreamRule,
};

/**
 * 기간 확인을 내는 몰(옛 확장 `COVERAGE_CAPABLE_MALLS` 규칙 그대로): 수집일로 걷은 성공 수집은 그날 주문을 빠짐없이
 * 봤다는 확인이다(주문이 없던 날도).
 */
const COVERAGE_CAPABLE_MALLS: ReadonlySet<string> = new Set(['haebub-mall', 'domeggook']);

export function mallOrdersCoverage(plan: Pick<MallOrdersPlan, 'mallKey' | 'collectionDate'>): { startDate: string; endDate: string } | null {
  return plan.collectionDate && COVERAGE_CAPABLE_MALLS.has(plan.mallKey)
    ? { startDate: plan.collectionDate, endDate: plan.collectionDate }
    : null;
}

export function mallCaptureReady(mallKey: MallOrderOperationMall): boolean {
  return MALL_CAPTURE_RULES[mallKey] !== undefined;
}

/**
 * scope 검증. 옮긴 몰(1차 4곳 중 규칙이 있는 몰)만, 자동 선택이면 본 행 키가 있어야 한다(옛 begin 규칙).
 */
export function mallOrdersScope(scope: unknown): MallOrdersScope & { mallKey: MallOrderOperationMall } {
  const parsed = MallOrdersScopeSchema.safeParse(scope);
  if (!parsed.success) throw invalid('invalid_scope', { errors: issues(parsed.error) });
  const value = parsed.data;
  if (!isMallOrderOperationMall(value.mallKey) || !mallCaptureReady(value.mallKey)) {
    throw invalid('mall_not_operation_kind', { mallKey: value.mallKey });
  }
  if (value.selectionMode === 'automatic' && !value.seenRowKeys) {
    throw invalid('automatic_selection_requires_seen_rows', { mallKey: value.mallKey });
  }
  return { ...value, mallKey: value.mallKey, channelAccountId: value.channelAccountId.toLowerCase() };
}

export function readMallOrdersPlan(value: unknown): MallOrdersPlan {
  const parsed = MallOrdersPlanSchema.safeParse(value);
  if (!parsed.success) throw invalid('invalid_plan', { errors: issues(parsed.error) });
  return parsed.data as MallOrdersPlan;
}

/** 청크 → 보관 캡처. `order_rows`는 순번대로 이어 붙이고, `continuation`은 받는 몰에서 한 장만. */
export function mallOrdersCapture(plan: MallOrdersPlan, chunks: readonly OperationStagedChunk[]): MallOrdersCapture {
  const rule = MALL_CAPTURE_RULES[plan.mallKey];
  if (!rule) throw invalid('mall_not_operation_kind', { mallKey: plan.mallKey });
  const rows: unknown[] = [];
  let continuation: unknown | null = null;
  for (const chunk of [...chunks].sort((a, b) => a.sequence - b.sequence)) {
    if (chunk.chunkKind === MALL_ORDERS_CHUNK_KIND) {
      rows.push(...chunk.payload);
      continue;
    }
    if (chunk.chunkKind === MALL_ORDERS_CONTINUATION_CHUNK_KIND && rule.continuation && continuation === null && chunk.payload.length === 1) {
      const parsed = rule.continuation.safeParse(chunk.payload[0]);
      if (!parsed.success) throw invalid('invalid_continuation', { errors: issues(parsed.error) });
      continuation = parsed.data;
      continue;
    }
    throw invalid('unexpected_chunk_kind', { chunkKind: chunk.chunkKind, sequence: chunk.sequence });
  }
  return rule.assemble({ rows, continuation, plan });
}

function issues(error: z.ZodError): Array<{ field: string; reason: string }> {
  return error.issues.slice(0, 5).map((issue) => ({ field: issue.path.join('.'), reason: issue.message }));
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
