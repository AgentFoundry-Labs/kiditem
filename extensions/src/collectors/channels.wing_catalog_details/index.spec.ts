import { describe, expect, it } from 'vitest';
import type { CoupangCatalogDetailProductV1 } from '@kiditem/shared/coupang-catalog-snapshot';
import { collectorFor } from '../index';
import { RuntimeError } from '../../core/errors';
import { wingCatalogDetailsCollector, type WingCatalogDetailsSite } from './index';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function detail(id: string): CoupangCatalogDetailProductV1 {
  return {
    externalProductId: id,
    options: [{ externalOptionId: `${id}-O`, documentIds: [] }],
    documents: [],
    media: [],
    raw: {},
  };
}

function fakeWing(options: {
  missing?: string[];
  failOn?: string;
  deleted?: string[];
  present?: string[];
} = {}) {
  const calls: string[] = [];
  const site: WingCatalogDetailsSite = {
    async productDetail(id) {
      calls.push(`detail:${id}`);
      if (id === options.failOn) throw new RuntimeError('SITE_LOGIN_REQUIRED', '쿠팡 윙 로그인이 필요합니다.');
      if (options.missing?.includes(id)) return null;
      return detail(id);
    },
    async probeDeleted(ids) {
      calls.push(`probe:${ids.length}`);
      return ids.map((externalProductId) => ({
        externalProductId,
        outcome: options.deleted?.includes(externalProductId) ? 'deleted' as const
          : options.present?.includes(externalProductId) ? 'present' as const : 'not_found' as const,
        productStatus: options.deleted?.includes(externalProductId) ? 'DELETED' : null,
      }));
    },
  };
  return { site, calls };
}

async function collect(site: WingCatalogDetailsSite, targets: string[], absent: string[] = []) {
  const chunks = [];
  const plan = { channelAccountId: ACCOUNT, detailTargetProductIds: targets, absentProductIds: absent, startedBy: null };
  for await (const chunk of wingCatalogDetailsCollector.collect(plan, site, { signal: new AbortController().signal, tabId: 1 })) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('collectors/channels.wing_catalog_details', () => {
  it('kind 이름으로 등록되고 wing 사이트를 쓴다', () => {
    expect(collectorFor('channels.wing_catalog_details')).toBe(wingCatalogDetailsCollector);
    expect(wingCatalogDetailsCollector.site).toBe('wing');
  });

  it('plan의 대상만 차례로 상세를 받아 full_details 20개씩, 사라진 상품은 100개씩 삭제 확인을 보낸다', async () => {
    const targets = Array.from({ length: 45 }, (_, index) => `T${index}`);
    const absent = Array.from({ length: 150 }, (_, index) => `A${index}`);
    const wing = fakeWing({ deleted: ['A0'], present: ['A1'] });
    const chunks = await collect(wing.site, targets, absent);

    expect(wing.calls).toEqual([...targets.map((id) => `detail:${id}`), 'probe:100', 'probe:50']);
    expect(chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length])).toEqual([
      ['full_details', 20], ['full_details', 20], ['full_details', 5],
      ['deletion_confirmation', 100], ['deletion_confirmation', 50],
    ]);
    expect(chunks[3]!.payload.slice(0, 3)).toEqual([
      { externalProductId: 'A0', outcome: 'deleted', productStatus: 'DELETED' },
      { externalProductId: 'A1', outcome: 'present', productStatus: null },
      { externalProductId: 'A2', outcome: 'not_found', productStatus: null },
    ]);
    expect(chunks.at(-1)?.progress).toEqual({ detailsDone: 45, detailTargets: 45, absentChecked: 150, absentTotal: 150, detailsMissing: [] });
  });

  it('상세가 사라진(없음) 대상은 건너뛰고 progress에 남긴다 — 서버는 그 상품을 그대로 두고 다음 동기화가 다시 잡는다', async () => {
    const chunks = await collect(fakeWing({ missing: ['T1'] }).site, ['T0', 'T1', 'T2']);
    expect(chunks.flatMap((chunk) => chunk.payload.map((item) => (item as CoupangCatalogDetailProductV1).externalProductId))).toEqual(['T0', 'T2']);
    expect(chunks.at(-1)?.progress).toMatchObject({ detailsDone: 2, detailsMissing: [{ externalProductId: 'T1', reason: 'not_found' }] });
  });

  it('상한을 넘는 상세(상품 512KiB·청크 1MiB)는 실행 전체를 멈추지 않고 건너뛰어 사유와 함께 남긴다', async () => {
    const site: WingCatalogDetailsSite = {
      async productDetail(id) {
        if (id === 'BIG') throw new RuntimeError('WING_CATALOG_PAYLOAD_TOO_LARGE', 'Wing 상세 상품 BIG가 허용 크기를 초과했습니다');
        if (id === 'HUGE') return { ...detail(id), raw: { padding: 'x'.repeat(1_100_000) } };
        return detail(id);
      },
      async probeDeleted() {
        return [];
      },
    };
    const chunks = await collect(site, ['T0', 'BIG', 'HUGE', 'T3']);
    expect(chunks.flatMap((chunk) => chunk.payload.map((item) => (item as CoupangCatalogDetailProductV1).externalProductId))).toEqual(['T0', 'T3']);
    expect(chunks.at(-1)?.progress).toMatchObject({
      detailsDone: 2,
      detailsMissing: [{ externalProductId: 'BIG', reason: 'too_large' }, { externalProductId: 'HUGE', reason: 'too_large' }],
    });
  });

  const requestFailed = (details: Record<string, unknown>) =>
    new RuntimeError('SITE_REQUEST_FAILED', '사이트 응답이 JSON이 아닙니다.', { url: 'https://wing.example/x', ...details });

  it('다시 물어도 받지 못한 상세 한 건은 실행을 죽이지 않고 건너뛰어 사유·본문 앞부분을 남긴다 — 다음 목록이 다시 잡는다', async () => {
    const failures: Record<string, Record<string, unknown>> = {
      T1: { status: 200, reason: 'not_json', bodyHead: '<html>busy</html>' },
      T2: { status: 503, reason: 'http', bodyHead: 'unavailable' },
      T3: { status: null, reason: 'network', bodyHead: null },
      T4: { status: null, reason: 'timeout', bodyHead: null },
    };
    const site: WingCatalogDetailsSite = {
      async productDetail(id) {
        if (failures[id]) throw requestFailed(failures[id]!);
        return detail(id);
      },
      async probeDeleted(ids) {
        return ids.map((externalProductId) => ({ externalProductId, outcome: 'not_found' as const, productStatus: null }));
      },
    };
    const chunks = await collect(site, ['T0', 'T1', 'T2', 'T3', 'T4', 'T5'], ['A0']);
    expect(chunks.flatMap((chunk) => chunk.payload.map((item) => (item as { externalProductId: string }).externalProductId))).toEqual(['T0', 'T5', 'A0']);
    expect(chunks.at(-1)?.progress).toMatchObject({
      detailsDone: 2,
      absentChecked: 1,
      detailsMissing: [
        { externalProductId: 'T1', reason: 'not_json', bodyHead: '<html>busy</html>' },
        { externalProductId: 'T2', reason: 'http_503', bodyHead: 'unavailable' },
        { externalProductId: 'T3', reason: 'network', bodyHead: null },
        { externalProductId: 'T4', reason: 'network', bodyHead: null },
      ],
    });
  });

  it('상세가 연속 10건 실패하면 CATALOG_DETAILS_UNREACHABLE로 멈춘다(마지막 본문 앞부분을 싣는다) — 사이에 성공이 있으면 셈을 새로 한다', async () => {
    const failing = new Set(Array.from({ length: 10 }, (_, index) => `G${index}`));
    const site: WingCatalogDetailsSite = {
      async productDetail(id) {
        if (failing.has(id)) throw requestFailed({ status: 200, reason: 'not_json', bodyHead: `<html>${id}</html>` });
        return detail(id);
      },
      async probeDeleted() {
        return [];
      },
    };
    const nine = Array.from({ length: 9 }, (_, index) => `G${index}`);
    await expect(collect(site, [...nine, 'OK', 'G9'])).resolves.toHaveLength(1);

    const error = await collect(site, ['OK', ...nine, 'G9', 'T1']).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(RuntimeError);
    expect(error).toMatchObject({ code: 'CATALOG_DETAILS_UNREACHABLE', details: { consecutiveFailures: 10, lastBodyHead: '<html>G9</html>' } });
  });

  it('로그인이 풀리면 그 오류로 멈춘다(runner가 failed로 닫는다)', async () => {
    const error = await collect(fakeWing({ failOn: 'T1' }).site, ['T0', 'T1', 'T2']).then(() => null, (caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
  });

  it('대상도 사라진 상품도 없으면(연쇄 없이 직접 시작한 빈 scope) 청크 없이 끝난다', async () => {
    expect(await collect(fakeWing().site, [])).toEqual([]);
  });
});
