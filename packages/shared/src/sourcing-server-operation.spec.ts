import { describe, expect, it } from 'vitest';
import {
  SOURCING_SERVER_CHUNK_KIND,
  SOURCING_SERVER_KINDS,
  SOURCING_SERVER_SCOPE_SCHEMAS,
  SourcingServerOperationResultSchema,
} from './sourcing-operation.js';

const alert = { sourceType: 'naver.trend', dedupeKey: 'source:naver.trend', title: '네이버 트렌드 수집 실패', href: '/sourcing-ai/market' };
const base = {
  sourceKey: 'naver.trend', scopeKey: 'default', targetKey: 'abc', planChecksum: 'c'.repeat(64),
  requestFingerprint: 'f'.repeat(64), requestIdempotencyKey: 'key-1', collectorKey: 'trend-naver',
  collectorVersion: 'trend-source/v1', attemptPlan: { source: 'naver.trend', keywords: ['a'] }, failureAlert: alert,
};

describe('서버 구동 소싱 kind 계약', () => {
  it('서버 kind는 8개이고 확장 kind와 겹치지 않는다', () => {
    expect([...SOURCING_SERVER_KINDS].sort()).toEqual([
      'sourcing.image_search_1688', 'sourcing.keyword_search_1688', 'sourcing.market_shadow',
      'sourcing.naver_keyword_analysis', 'sourcing.naver_trend', 'sourcing.scrape_url',
      'sourcing.shortstrend_trend', 'sourcing.taobao_live',
    ]);
  });

  it('청크 kind는 계약의 이름 규칙을 따른다', () => {
    expect(SOURCING_SERVER_CHUNK_KIND).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('scope의 sourceKey는 그 kind의 원천이어야 한다', () => {
    expect(SOURCING_SERVER_SCOPE_SCHEMAS['sourcing.naver_trend'].safeParse(base).success).toBe(true);
    expect(SOURCING_SERVER_SCOPE_SCHEMAS['sourcing.shortstrend_trend'].safeParse(base).success).toBe(false);
  });

  it('URL 수집은 1688·alibaba 원천만 받는다', () => {
    const schema = SOURCING_SERVER_SCOPE_SCHEMAS['sourcing.scrape_url'];
    expect(schema.safeParse({ ...base, sourceKey: '1688.scrape_url', scopeKey: 'product-url' }).success).toBe(true);
    expect(schema.safeParse({ ...base, sourceKey: 'alibaba.scrape_url', scopeKey: 'product-url' }).success).toBe(true);
    expect(schema.safeParse({ ...base, sourceKey: 'taobao.scrape_url', scopeKey: 'product-url' }).success).toBe(false);
  });

  it('섀도는 KST 하루(scope day, target YYYY-MM-DD)만 받는다', () => {
    const schema = SOURCING_SERVER_SCOPE_SCHEMAS['sourcing.market_shadow'];
    const shadow = { ...base, sourceKey: 'market_shadow_signals', scopeKey: 'day', targetKey: '2026-09-29' };
    expect(schema.safeParse(shadow).success).toBe(true);
    expect(schema.safeParse({ ...shadow, scopeKey: 'default' }).success).toBe(false);
    expect(schema.safeParse({ ...shadow, targetKey: 'today' }).success).toBe(false);
  });

  it('result는 실패 단위 결과와 URL 수집 결과를 선택으로 싣는다', () => {
    const result = {
      sourceKey: '1688.hot_product', scopeKey: 'default', targetKey: 'k', discoveredCount: 1, acceptedCount: 0,
      duplicateCount: 0, rejectedCount: 1, contentChecksum: 'a'.repeat(64),
      unitResult: { keyword: 'k', outcome: 'failed' },
    };
    expect(SourcingServerOperationResultSchema.parse(result).unitResult).toEqual({ keyword: 'k', outcome: 'failed' });
    expect(SourcingServerOperationResultSchema.safeParse({ ...result, scrapeUrlResult: { sourceRecordId: 'x' } }).success).toBe(false);
  });
});
