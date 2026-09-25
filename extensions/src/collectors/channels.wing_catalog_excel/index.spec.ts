import { describe, expect, it } from 'vitest';
import { collectorFor } from '../index';
import { RuntimeError } from '../../core/errors';
import { WORKBOOK_PART_CHARS, wingCatalogExcelCollector, type WingCatalogExcelSite } from './index';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

/** 가짜 Wing 다운로드 목록: 요청 뒤 폴링마다 정해 둔 상태를 차례로 보여 준다. */
function fakeWing(states: Array<{ status: string; executeCount: number; totalCount: number } | null>, file = new Uint8Array([1, 2, 3])) {
  const calls: string[] = [];
  const pauses: number[] = [];
  let description: string | null = null;
  let poll = 0;
  const site: WingCatalogExcelSite = {
    async requestCatalogExcel(value) {
      description = value;
      calls.push('request');
    },
    async catalogExcelRequest(value) {
      expect(value).toBe(description);
      calls.push('poll');
      const state = states[Math.min(poll, states.length - 1)];
      poll += 1;
      return state ? { id: '5192765', ...state } : null;
    },
    async downloadCatalogExcel(id) {
      calls.push(`download:${id}`);
      return file;
    },
    async pause(ms) {
      pauses.push(ms);
    },
  };
  return { site, calls, pauses };
}

async function collect(site: WingCatalogExcelSite) {
  const chunks = [];
  for await (const chunk of wingCatalogExcelCollector.collect({ channelAccountId: ACCOUNT }, site, { signal: new AbortController().signal, tabId: 1 })) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('collectors/channels.wing_catalog_excel', () => {
  it('kind 이름으로 등록되고 wing 사이트를 쓴다', () => {
    expect(collectorFor('channels.wing_catalog_excel')).toBe(wingCatalogExcelCollector);
    expect(wingCatalogExcelCollector.site).toBe('wing');
  });

  it('엑셀 생성을 한 번 요청하고, 다운로드 목록 진행률을 빈 청크(임대 연장)로 알린 뒤 COMPLETED면 파일을 workbook 조각으로 보낸다', async () => {
    const wing = fakeWing([
      null,
      { status: 'CREATING', executeCount: 500, totalCount: 1260 },
      { status: 'COMPLETED', executeCount: 1260, totalCount: 1260 },
    ], new TextEncoder().encode('xlsx-bytes'));
    const chunks = await collect(wing.site);

    expect(wing.calls).toEqual(['request', 'poll', 'poll', 'poll', 'download:5192765']);
    expect(wing.pauses.length).toBe(2);
    expect(chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length, chunk.progress])).toEqual([
      ['excel_progress', 0, { status: 'REQUESTED', executeCount: 0, totalCount: null }],
      ['excel_progress', 0, { status: 'CREATING', executeCount: 500, totalCount: 1260 }],
      ['excel_progress', 0, { status: 'COMPLETED', executeCount: 1260, totalCount: 1260 }],
      ['workbook', 1, { status: 'DOWNLOADED', bytes: 10 }],
    ]);
    expect(atob(chunks[3]!.payload[0] as string)).toBe('xlsx-bytes');
  });

  it('큰 파일은 base64 조각을 여러 청크로 나눈다', async () => {
    const file = new Uint8Array(WORKBOOK_PART_CHARS); // base64로 4/3배 → 조각 둘
    const chunks = await collect(fakeWing([{ status: 'COMPLETED', executeCount: 1, totalCount: 1 }], file).site);
    const parts = chunks.filter((chunk) => chunk.chunkKind === 'workbook').map((chunk) => chunk.payload[0] as string);
    expect(parts.map((part) => part.length <= WORKBOOK_PART_CHARS)).toEqual([true, true]);
    expect(Uint8Array.from(atob(parts.join('')), (character) => character.charCodeAt(0))).toEqual(file);
  });

  it('Wing이 생성을 멈추면 CATALOG_EXCEL_FAILED로 실패한다', async () => {
    const error = await collect(fakeWing([{ status: 'FAILED', executeCount: 3, totalCount: 10 }]).site).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(RuntimeError);
    expect((error as RuntimeError).code).toBe('CATALOG_EXCEL_FAILED');
  });
});
