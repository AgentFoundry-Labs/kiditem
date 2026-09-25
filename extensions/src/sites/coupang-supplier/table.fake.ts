import type { PageFetch, PageRow, PageTable } from './page';

/**
 * 스펙용 표 짓기: 읽기 다리(`content/orders/coupang-supplier-page.js`)가 탭에서 펴 주는 모양 그대로. 다리가 기록한
 * HTML을 이 모양으로 펴는지는 `src/coupang-supplier-bridge.spec.ts`(jsdom)가 잠근다.
 */
export function pageTable(input: { id?: string | null; head?: string[]; body?: Array<Array<string | { text: string; rowSpan: number }>>; section?: string }): PageTable {
  const rows: PageRow[] = [];
  if (input.head) rows.push({ section: 'thead', cells: input.head.map((text) => ({ text, rowSpan: 1, header: true })) });
  for (const cells of input.body ?? []) {
    rows.push({
      section: input.section ?? 'tbody',
      cells: cells.map((cell) => (typeof cell === 'string' ? { text: cell, rowSpan: 1, header: false } : { ...cell, header: false })),
    });
  }
  const text = rows.flatMap((row) => row.cells.map((cell) => cell.text)).join(' ');
  return { id: input.id ?? null, text, rows };
}

/** 다리의 200 응답 하나. */
export function bridgeAnswer(tables: PageTable[], overrides: Partial<PageFetch> & { text?: string } = {}) {
  return { ok: true, status: 200, redirected: false, url: 'https://supplier.coupang.com/x', text: '<html>', tables, ...overrides };
}
