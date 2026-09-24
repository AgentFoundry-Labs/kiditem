import { describe, expect, it } from 'vitest';
import {
  confirmItemState,
  decodeConfirmPayload,
  encodeConfirmPayload,
  entriesFromPayloads,
  itemKeyPrefix,
  renderConfirmHeader,
  renderConfirmPage,
  selectionStateFor,
  type ConfirmCandidate,
  type ConfirmEntry,
} from '../sourcing-confirm-report';

const ORG = '0f9c2b1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b';
const OTHER_ORG = '11111111-2222-4333-8444-555555555555';
const KEY_A = 'ab'.repeat(32);
const KEY_B = 'cd'.repeat(32);

function candidate(itemKey: string, overrides: Partial<ConfirmCandidate> = {}): ConfirmCandidate {
  return {
    itemKey,
    displayName: '말랑 슬라임 키트 <대용량>',
    sourceUrl: 'https://detail.1688.com/offer/123.html',
    overseasPriceCny: 12.5,
    overseasPriceKrw: 2400,
    salePriceKrw: 9900,
    estimatedMarginRate: 32.4,
    monthlySales: 1200,
    coupangSalePriceKrw: 10900,
    ...overrides,
  };
}

const text = (lines: ReturnType<typeof renderConfirmPage>['lines']) =>
  lines.map((line) => line.map((segment) => segment.text).join('')).join('\n');

describe('사장님 컨펌 보고 규칙', () => {
  it('⭐ 버튼 값은 번호 · 조직 · 상품 · 그린 때의 버전을 싣고, 가장 긴 값에 서명을 붙여도 텔레그램 64바이트 안에 든다', () => {
    // 가장 긴 경우: 번호 1295(base36 2자), 버전 Int 최댓값(base36 6자).
    const ref = { action: 'approve' as const, no: 1295, organizationId: ORG, keyPrefix: itemKeyPrefix(KEY_A), version: 2_147_483_647 };
    const payload = encodeConfirmPayload(ref);
    // 어댑터가 '.' + 서명 10자를 붙인다.
    expect(Buffer.byteLength(`${payload}.0123456789`, 'utf8')).toBeLessThanOrEqual(64);
    expect(decodeConfirmPayload(payload)).toEqual(ref);
    expect(decodeConfirmPayload(encodeConfirmPayload({ ...ref, no: 40, version: 0 }))).toEqual({ ...ref, no: 40, version: 0 });
  });

  it('버전이 없는 예전 버튼 값(k1)은 읽지 않는다', () => {
    const organization = Buffer.from(ORG.replaceAll('-', ''), 'hex').toString('base64url');
    expect(decodeConfirmPayload(['k1', 'a', '1', organization, itemKeyPrefix(KEY_A)].join('.'))).toBeNull();
  });

  it('모르는 모양의 버튼 값은 읽지 않는다', () => {
    for (const bad of ['', 'k1', 'k2.a.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAA', 'k1.z.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAA', 'k1.a.0.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAA', 'k1.a.1.short.AAAAAAAAAAA']) {
      expect(decodeConfirmPayload(bad), bad).toBeNull();
    }
  });

  it('상품 열쇠 앞자리는 항상 같은 11자다', () => {
    expect(itemKeyPrefix(KEY_A)).toHaveLength(11);
    expect(itemKeyPrefix(KEY_A)).toBe(itemKeyPrefix(KEY_A));
    expect(itemKeyPrefix(KEY_A)).not.toBe(itemKeyPrefix(KEY_B));
    expect(() => itemKeyPrefix('not-a-key')).toThrow();
  });

  it('⭐ 승인은 selected, 반려는 removed, 되돌리기는 neutral — 최종 선택 화면과 같은 자리에 남는다', () => {
    expect(selectionStateFor('approve')).toBe('selected');
    expect(selectionStateFor('reject')).toBe('removed');
    expect(selectionStateFor('undo')).toBe('neutral');
    expect(confirmItemState('selected')).toBe('approved');
    expect(confirmItemState('removed')).toBe('rejected');
    expect(confirmItemState(undefined)).toBe('pending');
  });

  it('⭐ 대기 후보에는 승인 · 반려, 결정된 후보에는 되돌리기, 빠진 후보에는 안내 버튼이 달린다', () => {
    const entries: ConfirmEntry[] = [
      { no: 1, keyPrefix: itemKeyPrefix(KEY_A), candidate: candidate(KEY_A), state: 'pending', version: 0 },
      { no: 2, keyPrefix: itemKeyPrefix(KEY_B), candidate: candidate(KEY_B), state: 'approved', version: 4 },
      { no: 3, keyPrefix: itemKeyPrefix('ef'.repeat(32)), candidate: null, state: 'pending', version: 0 },
    ];
    const page = renderConfirmPage(ORG, entries);

    expect(page.buttons.map((row) => row.map((button) => decodeConfirmPayload(button.payload)?.action))).toEqual([
      ['approve', 'reject'],
      ['undo'],
      ['info'],
    ]);
    expect(page.buttons.map((row) => row.map((button) => decodeConfirmPayload(button.payload)?.version))).toEqual([
      [0, 0],
      [4],
      [0],
    ]);
    const body = text(page.lines);
    expect(body).toContain('⬜ 1. 말랑 슬라임 키트 <대용량>');
    expect(body).toContain('1688 ¥12.5 (₩2,400) · 판매가 ₩9,900 · 마진 32% · 월 1,200개');
    expect(body).toContain('✅ 2.');
    expect(body).toContain('3. 새 추천에서 빠진 상품');
    expect(body).toContain('이 묶음 · 대기 1 · 승인 1 · 반려 0');
    // 상품명은 굵게, 1688 주소는 링크로.
    expect(page.lines.flat().find((segment) => segment.href)?.href).toBe('https://detail.1688.com/offer/123.html');
    expect(page.lines.flat().some((segment) => segment.bold && segment.text.startsWith('말랑'))).toBe(true);
  });

  it('⭐ 메시지의 버튼만으로 그 메시지가 담은 번호와 상품을 되찾는다 — 조직이 섞이면 버린다', () => {
    const page = renderConfirmPage(ORG, [
      { no: 2, keyPrefix: itemKeyPrefix(KEY_B), candidate: candidate(KEY_B), state: 'rejected', version: 2 },
      { no: 1, keyPrefix: itemKeyPrefix(KEY_A), candidate: candidate(KEY_A), state: 'pending', version: 0 },
    ]);
    const payloads = page.buttons.flat().map((button) => button.payload);
    expect(entriesFromPayloads(payloads)).toEqual({
      organizationId: ORG,
      refs: [
        { no: 1, keyPrefix: itemKeyPrefix(KEY_A) },
        { no: 2, keyPrefix: itemKeyPrefix(KEY_B) },
      ],
    });

    const foreign = encodeConfirmPayload({ action: 'approve', no: 3, organizationId: OTHER_ORG, keyPrefix: itemKeyPrefix(KEY_A), version: 0 });
    expect(entriesFromPayloads([...payloads, foreign])).toBeNull();
    expect(entriesFromPayloads([])).toBeNull();
  });

  it('보고 머리말은 후보 수와 대기 수, 나머지를 다음에 보낸다는 안내를 적는다', () => {
    const header = renderConfirmHeader({ generatedAt: '2026-09-13T05:20:00.000Z', total: 60, pending: 50, reported: 40 });
    const body = text(header.lines);
    expect(body).toContain('추천 9월 13일 14:20 기준 · 후보 60개 중 컨펌 대기 50개');
    expect(body).toContain('앞의 40개');
    expect(header.buttons).toEqual([]);
  });
});
