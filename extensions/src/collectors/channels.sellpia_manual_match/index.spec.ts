import { describe, expect, it } from 'vitest';
import { SellpiaManualMatchRowSchema } from '@kiditem/shared/sellpia-manual-match';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { sellpiaManualMatchCollector, type ManualMatchCandidate, type SellpiaManualMatchSite } from './index';

const plan = (targetCodes: string[]) => ({
  sourceType: 'sellpia_product_manual_match',
  parserVersion: 'sellpia-manual-match-v1',
  sourceOrigin: 'https://kiditem.sellpia.com',
  sourcePath: '/product_manual_match.html',
  targetCount: targetCodes.length,
  targetCodes,
});
const md5 = (seed: string) => seed.repeat(32).slice(0, 32);

function fakeSellpia(search: (codes: readonly string[]) => ManualMatchCandidate[], types: Record<string, 'M' | 'P' | 'E'>) {
  const searched: string[][] = [];
  const statused: string[][] = [];
  let closed = 0;
  const site: SellpiaManualMatchSite = {
    async manualMatchSearch(codes) {
      searched.push([...codes]);
      return search(codes);
    },
    async manualMatchStatus(matchMd5s) {
      statused.push([...matchMd5s]);
      return Object.fromEntries(matchMd5s.map((value) => [value, types[value]!]));
    },
    async closeManualMatch() {
      closed += 1;
    },
  };
  return { site, searched, statused, closed: () => closed };
}

async function collectAll(rawPlan: Record<string, unknown>, site: SellpiaManualMatchSite, reports: Array<Record<string, unknown>> = []) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of sellpiaManualMatchCollector.collect(rawPlan as never, site, {
    signal: new AbortController().signal,
    tabId: null,
    report: async (progress) => {
      reports.push(progress);
    },
  })) chunks.push(chunk);
  return chunks;
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('collectors/channels.sellpia_manual_match', () => {
  it('kind 이름으로 등록되고 sellpia 사이트를 쓴다', () => {
    expect(collectorFor('channels.sellpia_manual_match')).toBe(sellpiaManualMatchCollector);
    expect(sellpiaManualMatchCollector.site).toBe('sellpia');
  });

  it('대상을 100개씩 검색하고, md5를 100개씩 상태 조회해 (코드·제목·수량·종류)마다 근거 수를 센 정렬된 줄을 낸다', async () => {
    const targets = Array.from({ length: 150 }, (_, index) => `${1000 + index}-1`);
    const fake = fakeSellpia((codes) => codes.flatMap((code) => code === '1000-1'
      ? [
        { productCode: code, aliasTitle: '샤이니 링', matchMd5: md5('a'), itemCount: 12 },
        { productCode: code, aliasTitle: '샤이니 링', matchMd5: md5('b'), itemCount: 12 },
        { productCode: code, aliasTitle: '샤이니 링', matchMd5: md5('a'), itemCount: 12 }, // 같은 md5 안의 같은 후보는 한 번
      ]
      : code === '1149-1'
        ? [{ productCode: code, aliasTitle: '공룡 물총', matchMd5: md5('c'), itemCount: 1 }]
        : []), { [md5('a')]: 'M', [md5('b')]: 'M', [md5('c')]: 'E' });
    const reports: Array<Record<string, unknown>> = [];
    const chunks = await collectAll(plan(targets), fake.site, reports);

    expect(fake.searched.map((batch) => batch.length)).toEqual([100, 50]);
    expect(fake.statused).toEqual([[md5('a'), md5('b'), md5('c')]]);
    expect(fake.closed()).toBe(1);
    expect(reports).toEqual([
      { searched: 100, targets: 150, candidates: 3 },
      { searched: 150, targets: 150, candidates: 4 },
    ]);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['match_results']);
    const rows = chunks[0]!.payload.map((row) => SellpiaManualMatchRowSchema.parse(row));
    expect(rows).toEqual([
      { productCode: '1000-1', aliasTitle: '샤이니 링', itemCount: 12, matchedType: 'M', evidenceCount: 2 },
      { productCode: '1149-1', aliasTitle: '공룡 물총', itemCount: 1, matchedType: 'E', evidenceCount: 1 },
    ]);
  });

  it('근거가 없으면 청크 없이 끝난다(서버가 빈 스냅샷으로 바꿔 쓴다)', async () => {
    await expect(collectAll(plan(['1-1']), fakeSellpia(() => [], {}).site)).resolves.toEqual([]);
  });

  it('같은 md5 안에서 같은 후보의 수량이 다르면 MALL_CONTRACT_CHANGED로 멈추고 탭을 정리한다', async () => {
    const fake = fakeSellpia((codes) => codes.flatMap((code) => [
      { productCode: code, aliasTitle: '링', matchMd5: md5('a'), itemCount: 1 },
      { productCode: code, aliasTitle: '링', matchMd5: md5('a'), itemCount: 2 },
    ]), { [md5('a')]: 'M' });
    const error = await failure(collectAll(plan(['1-1']), fake.site));
    expect(error.code).toBe('MALL_CONTRACT_CHANGED');
    expect(fake.closed()).toBe(1);
  });

  it('plan이 틀리면 읽지 않고 RUNTIME_PLAN_INVALID', async () => {
    const fake = fakeSellpia(() => [], {});
    const error = await failure(collectAll({ ...plan(['1-1']), targetCount: 2 }, fake.site));
    expect(error.code).toBe('RUNTIME_PLAN_INVALID');
    expect(fake.searched).toEqual([]);
  });
});
