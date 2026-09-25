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
    expect(chunks.at(-1)?.progress).toMatchObject({ detailsDone: 2, detailsMissing: ['T1'] });
  });

  it('로그인이 풀리면 그 오류로 멈춘다(runner가 failed로 닫는다)', async () => {
    const error = await collect(fakeWing({ failOn: 'T1' }).site, ['T0', 'T1', 'T2']).then(() => null, (caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
  });

  it('대상도 사라진 상품도 없으면(연쇄 없이 직접 시작한 빈 scope) 청크 없이 끝난다', async () => {
    expect(await collect(fakeWing().site, [])).toEqual([]);
  });
});
