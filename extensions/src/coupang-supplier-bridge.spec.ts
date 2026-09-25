// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import bridgeSource from '../kiditem-os/content/orders/coupang-supplier-page.js?raw';
import type { PageTable } from './sites/coupang-supplier/page';
import { pageTable } from './sites/coupang-supplier/table.fake';

// 서플라이어 읽기 다리(content script)가 기록한 HTML을 사이트 스펙의 칸 모양 그대로 펴는지 잠근다(KID-359).
// 사이트 스펙은 `pageTable`로 지은 칸을 쓰므로, 이 스펙이 다리와 사이트 스펙 사이의 약속이다.
type Bridge = { tablesOf(html: string): PageTable[] };
let bridge: Bridge;

beforeAll(() => {
  const scope = globalThis as unknown as { chrome?: unknown; KidItemCoupangSupplierPage?: Bridge };
  scope.chrome = { runtime: { id: 'test', onMessage: { addListener() {} } } };
  new Function(bridgeSource)();
  bridge = scope.KidItemCoupangSupplierPage!;
});

const rowsOf = (tables: PageTable[]) => tables.map(({ id, rows }) => ({ id, rows: rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, text: cell.text.trim() })) })) }));

describe('서플라이어 읽기 다리 — 표 펴기', () => {
  it('쉽먼트 목록 표: 머리는 thead 머리칸, 행은 tbody 칸(한 칸짜리 안내 행 포함)', () => {
    const html = `<!doctype html><html><body><table id="parcel-tab">
      <thead><tr><th>쉽먼트 번호</th><th>발송일</th><th>박스수</th></tr></thead>
      <tbody><tr><td>48835181</td><td>2026-07-24 15:02</td><td>1 박스</td></tr><tr><td colspan="3">없음</td></tr></tbody>
    </table></body></html>`;
    expect(rowsOf(bridge.tablesOf(html))).toEqual(rowsOf([
      pageTable({ id: 'parcel-tab', head: ['쉽먼트 번호', '발송일', '박스수'], body: [['48835181', '2026-07-24 15:02', '1 박스'], ['없음']] }),
    ]));
  });

  it('로켓 발주 상세 표: 첫 칸의 rowspan을 싣고, 안쪽 표의 행은 바깥 표 행에 섞지 않는다', () => {
    const html = `<table><tbody>
      <tr><td rowspan="2">1</td><td>P1</td></tr><tr><td>이어지는 칸</td></tr>
      <tr><td><table><tbody><tr><td>안쪽</td></tr></tbody></table></td></tr>
    </tbody></table>`;
    const [outer, inner] = bridge.tablesOf(html);
    expect(outer!.rows.map((row) => row.cells.map((cell) => [cell.text.trim(), cell.rowSpan]))).toEqual([
      [['1', 2], ['P1', 1]],
      [['이어지는 칸', 1]],
      [['안쪽', 1]],
    ]);
    expect(inner!.rows).toHaveLength(1);
    expect(outer!.text).toContain('안쪽');
  });
});
