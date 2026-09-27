import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MallListingMatrixColumn, MallListingMatrixRow } from '@kiditem/shared/mall-publishing';

const read = vi.hoisted(() => vi.fn());
vi.mock('../../_shared/mall-availability-send', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../_shared/mall-availability-send')>()),
  readMallAvailabilityMany: read,
}));

const { liveCellKey, useMallLiveAvailability } = await import('./use-mall-live-availability');

const ACCOUNT = '22222222-2222-4222-8222-222222222222';

const columns = [
  { mallKey: 'coupang', mallName: '쿠팡', channelAccountId: ACCOUNT },
  { mallKey: 'kakao', mallName: '톡스토어', channelAccountId: null },
  { mallKey: 'domeggook', mallName: '도매꾹', channelAccountId: ACCOUNT },
] as MallListingMatrixColumn[];

const rows = [
  { cells: [
    { mallKey: 'coupang', state: 'published', externalId: 'A' },
    { mallKey: 'kakao', state: 'published', externalId: 'K' },
    { mallKey: 'domeggook', state: 'published', externalId: 'D' },
  ] },
  { cells: [{ mallKey: 'coupang', state: 'published', externalId: 'B' }, { mallKey: 'coupang', state: 'draft', externalId: 'X' }] },
] as unknown as MallListingMatrixRow[];

beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue(new Map([['A', [{ optionCode: 'a', stock: 0, rocket: false }]]]));
});

describe('useMallLiveAvailability', () => {
  it('⭐ 페이지가 뜨면 읽을 수 있고 계정이 있는 몰 열마다 판매 상태 읽기 실행 하나를 자동으로 시작한다', async () => {
    const { result } = renderHook(() => useMallLiveAvailability(columns, rows));

    await waitFor(() => expect(result.current.cells.get(liveCellKey('coupang', 'A'))?.status).toBe('ready'));
    // 도매꾹은 읽기 몰이 아니고, 톡스토어는 계정 행이 없다 — 쿠팡 한 번만.
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith({ mallKey: 'coupang', channelAccountId: ACCOUNT, codes: ['A', 'B'], automatic: true });
    expect(result.current.cells.get(liveCellKey('coupang', 'B'))).toEqual({ status: 'error', message: '이 상품을 몰에서 찾지 못했습니다.' });
  });

  it('칸 하나 다시 읽기는 사람이 누른 읽기다(자동 로그인 간격 없음)', async () => {
    const { result } = renderHook(() => useMallLiveAvailability(columns, rows));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await result.current.refresh('coupang', 'A');
    expect(read).toHaveBeenLastCalledWith({ mallKey: 'coupang', channelAccountId: ACCOUNT, codes: ['A'] });
  });

  it('읽기 폴링 예산(분당 요청 수)을 파일 주석에 적어 둔다 — 한 화면이 몰 여러 곳을 자동으로 읽는다', () => {
    const source = readFileSync(path.resolve(__dirname, 'use-mall-live-availability.ts'), 'utf8');
    expect(source).toMatch(/분당 300회/);
    expect(source).toMatch(/분당 600회/);
  });
});
