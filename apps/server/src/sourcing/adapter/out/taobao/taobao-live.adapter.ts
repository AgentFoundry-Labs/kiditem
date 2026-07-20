import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  TaobaoLiveCollection,
  TaobaoLivePort,
  TaobaoLiveProduct,
  TaobaoLiveReadiness,
  TaobaoLiveRoom,
} from '../../../application/port/out/provider/taobao-live.port';

const DEFAULT_TOP_BASE_URL = 'https://eco.taobao.com/router/rest';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_LIVE_IDS = 30;

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

@Injectable()
export class TaobaoLiveAdapter implements TaobaoLivePort {
  private readonly fetchImpl: FetchLike = (...args) => fetch(...args);

  readiness(): TaobaoLiveReadiness {
    const missing = [];
    if (!process.env.TAOBAO_TOP_APP_KEY?.trim()) missing.push('TAOBAO_TOP_APP_KEY');
    if (!process.env.TAOBAO_TOP_APP_SECRET?.trim()) missing.push('TAOBAO_TOP_APP_SECRET');
    return { configured: missing.length === 0, mode: 'official-api', missing };
  }

  async collect(input: {
    queryDate: string;
    liveIds: string[];
    pageSize: number;
  }): Promise<TaobaoLiveCollection> {
    const config = this.config();
    const warnings: string[] = [];
    const rooms: TaobaoLiveRoom[] = [];
    const products: TaobaoLiveProduct[] = [];
    let successCount = 0;

    const tasks: Array<Promise<void>> = [
      this.queryDataApi(config, 'taobao.live.contents.query', input.queryDate, input.pageSize)
        .then((records) => {
          successCount += 1;
          rooms.push(...records.map(normalizeTaobaoRoom).filter(isPresent));
        })
        .catch((error) => {
          warnings.push(`방송 목록: ${errorMessage(error)}`);
        }),
      this.queryDataApi(config, 'taobao.live.items.query', input.queryDate, input.pageSize)
        .then((records) => {
          successCount += 1;
          products.push(
            ...records
              .map((record, index) => normalizeTaobaoProduct(record, input.queryDate, index))
              .filter(isPresent),
          );
        })
        .catch((error) => {
          warnings.push(`방송 상품: ${errorMessage(error)}`);
        }),
    ];

    const liveIds = Array.from(new Set(input.liveIds.map((id) => id.trim()).filter(Boolean)))
      .slice(0, MAX_LIVE_IDS);
    if (liveIds.length > 0) {
      tasks.push(
        this.queryKnownRooms(config, liveIds)
          .then((items) => {
            successCount += 1;
            rooms.push(...items);
          })
          .catch((error) => {
            warnings.push(`지정 방송방: ${errorMessage(error)}`);
          }),
      );
    }

    await Promise.all(tasks);
    if (successCount === 0) {
      throw new Error(warnings.join(' · ') || '타오바오 라이브 API 호출에 실패했습니다.');
    }
    return {
      rooms: dedupeBy(rooms, (room) => room.broadcastId),
      products: dedupeBy(products, (product) => `${product.broadcastId}\u0000${product.productId}`),
      warnings,
    };
  }

  private async queryKnownRooms(
    config: TaobaoTopConfig,
    liveIds: string[],
  ): Promise<TaobaoLiveRoom[]> {
    const response = await this.callTop(config, 'taobao.live.batchlives.get', {
      live_ids: liveIds.join(','),
      source: 'top',
      type: '1,2,5',
    });
    const root = recordValue(response.live_batchlives_get_response) ?? response;
    assertNoTopError(root);
    const result = recordValue(root.result) ?? root;
    const liveList = recordValue(result.live_list);
    const raw = liveList?.live_video_do;
    const records = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return records.map(recordValue).filter(isPresent).map(normalizeTaobaoRoom).filter(isPresent);
  }

  private async queryDataApi(
    config: TaobaoTopConfig,
    method: 'taobao.live.contents.query' | 'taobao.live.items.query',
    queryDate: string,
    pageSize: number,
  ): Promise<JsonRecord[]> {
    const request: JsonRecord = {
      query_date: queryDate,
      start: 0,
      page_size: pageSize,
    };
    const response = await this.callTop(config, method, {
      query_request: JSON.stringify(request),
    });
    const responseKey = method === 'taobao.live.contents.query'
      ? 'live_contents_query_response'
      : 'live_items_query_response';
    const root = recordValue(response[responseKey]) ?? response;
    assertNoTopError(root);
    if (root.success === false || String(root.msg_code ?? '') === '500') {
      throw new Error(textValue(root.msg_info) ?? '타오바오 라이브 API가 실패를 반환했습니다.');
    }
    const model = recordValue(root.model) ?? root;
    return parseDataRecords(model.data_json_str);
  }

  private async callTop(
    config: TaobaoTopConfig,
    method: string,
    businessParams: Record<string, string>,
  ): Promise<JsonRecord> {
    const params: Record<string, string> = {
      method,
      app_key: config.appKey,
      sign_method: 'hmac',
      timestamp: formatChinaTimestamp(new Date()),
      format: 'json',
      v: '2.0',
      simplify: 'false',
      ...businessParams,
    };
    params.sign = signTopParams(params, config.appSecret);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await this.fetchImpl(config.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: new URLSearchParams(params),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = await response.json() as unknown;
      const record = recordValue(body);
      if (!record) throw new Error('타오바오 라이브 API 응답 형식이 올바르지 않습니다.');
      assertNoTopError(record);
      return record;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`타오바오 라이브 API가 ${config.timeoutMs}ms 안에 응답하지 않았습니다.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private config(): TaobaoTopConfig {
    const appKey = process.env.TAOBAO_TOP_APP_KEY?.trim();
    const appSecret = process.env.TAOBAO_TOP_APP_SECRET?.trim();
    const missing = this.readiness().missing;
    if (!appKey || !appSecret) {
      throw new Error(`타오바오 TOP 연결 설정이 없습니다: ${missing.join(', ')}`);
    }
    return {
      appKey,
      appSecret,
      baseUrl: process.env.TAOBAO_TOP_BASE_URL?.trim() || DEFAULT_TOP_BASE_URL,
      timeoutMs: positiveInteger(process.env.TAOBAO_TOP_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS,
    };
  }
}

interface TaobaoTopConfig {
  appKey: string;
  appSecret: string;
  baseUrl: string;
  timeoutMs: number;
}

export function signTopParams(params: Record<string, string>, secret: string): string {
  const canonical = Object.entries(params)
    .filter(([key]) => key !== 'sign')
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, value]) => `${key}${value}`)
    .join('');
  return createHmac('md5', secret).update(canonical, 'utf8').digest('hex').toUpperCase();
}

function formatChinaTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}:${read('second')}`;
}

function normalizeTaobaoRoom(record: JsonRecord): TaobaoLiveRoom | null {
  const broadcastId = stringFrom(record, ['live_id', 'liveId', 'room_id', 'roomId', 'content_id', 'id']);
  if (!broadcastId) return null;
  const broadcaster = recordValue(record.simple_broad_caster) ?? recordValue(record.broadcaster) ?? {};
  const statusValue = stringFrom(record, ['room_status', 'roomStatus', 'status']);
  return {
    broadcastId,
    title: stringFrom(record, ['title', 'topic', 'desc_info', 'name']),
    broadcasterId: stringFrom(broadcaster, ['account_id', 'accountId', 'id'])
      ?? stringFrom(record, ['account_id', 'anchor_id', 'broadcaster_id']),
    broadcasterName: stringFrom(broadcaster, ['account_name', 'accountName', 'tb_nick', 'name'])
      ?? stringFrom(record, ['user_nick', 'anchor_name', 'broadcaster_name']),
    status: normalizeRoomStatus(statusValue),
    viewerCount: numberFrom(record, ['total_view_count', 'view_count', 'join_count', 'viewerCount']),
    likeCount: numberFrom(record, ['praise_count', 'like_count', 'likeCount']),
    startedAt: dateFrom(record, ['start_time', 'startTime', 'started_at']),
    endedAt: dateFrom(record, ['end_time', 'endTime', 'ended_at']),
    coverImageUrl: stringFrom(record, ['cover_img169', 'cover_img', 'coverImageUrl', 'cover_url']),
    sourceUrl: stringFrom(record, ['native_feed_detail_url', 'source_url', 'page_url', 'live_url']),
  };
}

function normalizeTaobaoProduct(
  record: JsonRecord,
  queryDate: string,
  index: number,
): TaobaoLiveProduct | null {
  const productId = stringFrom(record, ['item_id', 'itemId', 'product_id', 'productId', 'id']);
  if (!productId) return null;
  return {
    broadcastId: stringFrom(record, ['live_id', 'liveId', 'room_id', 'roomId', 'content_id'])
      ?? `taobao-date-${queryDate}`,
    productId,
    rank: numberFrom(record, ['rank', 'item_index', 'itemIndex']) ?? index + 1,
    title: stringFrom(record, ['item_title', 'itemTitle', 'title', 'product_name', 'name']),
    priceCny: numberFrom(record, ['price', 'item_price', 'itemPrice', 'promotion_price']),
    salesCount: numberFrom(record, ['sales_count', 'sold_count', 'item_sold_count', 'volume']),
    imageUrl: stringFrom(record, ['item_pic', 'itemPic', 'image_url', 'pic_url', 'cover']),
    sourceUrl: stringFrom(record, ['item_url', 'itemUrl', 'source_url', 'detail_url', 'url']),
  };
}

function normalizeRoomStatus(value: string | null): string | null {
  if (value === '1') return 'live';
  if (value === '0') return 'scheduled';
  if (value === '2') return 'replay';
  return value;
}

function parseDataRecords(value: unknown): JsonRecord[] {
  let decoded = value;
  for (let attempt = 0; attempt < 2 && typeof decoded === 'string'; attempt += 1) {
    try {
      decoded = JSON.parse(decoded);
    } catch {
      return [];
    }
  }
  return flattenRecords(decoded);
}

function flattenRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(recordValue).filter(isPresent);
  const record = recordValue(value);
  if (!record) return [];
  for (const key of ['data', 'list', 'items', 'records', 'result']) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested.map(recordValue).filter(isPresent);
  }
  return [record];
}

function assertNoTopError(record: JsonRecord): void {
  const error = recordValue(record.error_response);
  if (!error) return;
  const message = textValue(error.sub_msg) ?? textValue(error.msg) ?? '타오바오 TOP API 오류';
  const code = textValue(error.sub_code) ?? textValue(error.code);
  throw new Error(code ? `${message} (${code})` : message);
}

function recordValue(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function stringFrom(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = textValue(record[key]);
    if (value) return value;
  }
  return null;
}

function numberFrom(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const raw = record[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(/,/g, '')) : NaN;
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function dateFrom(record: JsonRecord, keys: string[]): Date | null {
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const millis = raw < 10_000_000_000 ? raw * 1000 : raw;
      const date = new Date(millis);
      if (!Number.isNaN(date.getTime())) return date;
    }
    if (typeof raw === 'string' && raw.trim()) {
      const numeric = Number(raw);
      const date = Number.isFinite(numeric)
        ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
        : new Date(raw);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

function positiveInteger(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
