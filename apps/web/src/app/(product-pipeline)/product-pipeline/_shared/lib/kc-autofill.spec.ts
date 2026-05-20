import { describe, expect, it } from 'vitest';
import { extractKcCertificationNumber } from './kc-autofill';
import type { KidsPlayfulGenerationItem } from '../../detail-template-generation/hooks/useKidsPlayfulGenerate';

function buildEntry(
  overrides: Partial<KidsPlayfulGenerationItem> & { createdAt: string },
): KidsPlayfulGenerationItem {
  return {
    id: overrides.id ?? 'entry-id',
    productId: null,
    sourceCandidateId: null,
    contentWorkspaceId: null,
    templateId: 'bold-vertical',
    productName: '테스트',
    rawInput: {},
    result: overrides.result ?? ({} as KidsPlayfulGenerationItem['result']),
    imageUrls: [],
    processedImages: {},
    imageProcessingStatus: overrides.imageProcessingStatus ?? 'completed',
    imageProcessingError: null,
    createdAt: overrides.createdAt,
    ...overrides,
  } as KidsPlayfulGenerationItem;
}

describe('extractKcCertificationNumber', () => {
  it('returns the KC number from bold-vertical productInfo', () => {
    const entries = [
      buildEntry({
        createdAt: '2026-05-19T10:00:00Z',
        result: {
          productInfo: [
            { key: '제품명', value: '말랑 슬라임' },
            { key: 'KC 인증번호', value: 'CB065R1579-2008' },
          ],
        } as KidsPlayfulGenerationItem['result'],
      }),
    ];
    expect(extractKcCertificationNumber(entries)).toBe('CB065R1579-2008');
  });

  it('returns null when productInfo has placeholder value only', () => {
    const entries = [
      buildEntry({
        createdAt: '2026-05-19T10:00:00Z',
        result: {
          productInfo: [{ key: 'KC 인증번호', value: '있음' }],
        } as KidsPlayfulGenerationItem['result'],
      }),
    ];
    expect(extractKcCertificationNumber(entries)).toBeNull();
  });

  it('returns null for descriptive AI text that is not a KC number', () => {
    const entries = [
      buildEntry({
        createdAt: '2026-05-19T10:00:00Z',
        result: {
          productInfo: [
            { key: 'KC 인증번호', value: 'KC 인증 대상' },
            { key: 'KC 인증', value: '상세페이지 참조' },
          ],
        } as KidsPlayfulGenerationItem['result'],
      }),
    ];
    expect(extractKcCertificationNumber(entries)).toBeNull();
  });

  it('normalizes spacing in valid KC numbers', () => {
    const entries = [
      buildEntry({
        createdAt: '2026-05-19T10:00:00Z',
        result: {
          productInfo: [{ key: 'KC 인증번호', value: ' cb 065r1579-2008 ' }],
        } as KidsPlayfulGenerationItem['result'],
      }),
    ];
    expect(extractKcCertificationNumber(entries)).toBe('CB065R1579-2008');
  });

  it('skips entries still processing', () => {
    const entries = [
      buildEntry({
        createdAt: '2026-05-19T11:00:00Z',
        imageProcessingStatus: 'processing',
        result: {
          productInfo: [{ key: 'KC 인증번호', value: 'CB065R1579-2008' }],
        } as KidsPlayfulGenerationItem['result'],
      }),
    ];
    expect(extractKcCertificationNumber(entries)).toBeNull();
  });

  it('prefers the most recent completed entry', () => {
    const entries = [
      buildEntry({
        id: 'old',
        createdAt: '2026-05-18T10:00:00Z',
        result: {
          productInfo: [{ key: 'KC 인증번호', value: 'OLD-1111' }],
        } as KidsPlayfulGenerationItem['result'],
      }),
      buildEntry({
        id: 'new',
        createdAt: '2026-05-19T10:00:00Z',
        result: {
          productInfo: [{ key: 'KC 인증번호', value: 'NEW-2222' }],
        } as KidsPlayfulGenerationItem['result'],
      }),
    ];
    expect(extractKcCertificationNumber(entries)).toBe('NEW-2222');
  });

  it('returns null when no productInfo exists', () => {
    const entries = [
      buildEntry({
        createdAt: '2026-05-19T10:00:00Z',
        result: {} as KidsPlayfulGenerationItem['result'],
      }),
    ];
    expect(extractKcCertificationNumber(entries)).toBeNull();
  });
});
