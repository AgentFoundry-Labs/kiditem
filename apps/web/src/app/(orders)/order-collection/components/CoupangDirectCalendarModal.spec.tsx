import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoupangDirectCalendarModal } from './CoupangDirectCalendarModal';
import type { CoupangDirectPo } from '../lib/coupang-directship-api';

function po(seq: string, transport: string, edd: string, qty: number): CoupangDirectPo {
  return {
    seq, status: 'PA', center: '인천36', transport, edd, reg: '2026-07-30',
    items: [{ skuId: `${seq}-1`, barcode: '', name: '상품', qty, amount: qty * 100 }],
  } as CoupangDirectPo;
}

// 2026-07-30(목) 접수 → 입고예정일 08-04(다음주 화)까지가 이번 회차.
const TODAY = '2026-07-30';
const POS = [
  po('PO-1', 'MILKRUN', '2026-07-31', 5),
  po('PO-2', 'MILKRUN', '2026-07-31', 3),
  po('PO-3', 'SHIPMENT', '2026-08-04', 7),
];

function renderModal(over: Partial<Parameters<typeof CoupangDirectCalendarModal>[0]> = {}) {
  const onCollect = vi.fn();
  const onRefresh = vi.fn();
  render(
    <CoupangDirectCalendarModal
      open
      loading={false}
      refreshing={false}
      hasCapture
      collectedAt="2026-07-30T01:05:00.000Z"
      pos={POS}
      collectedSeqs={new Set()}
      today={TODAY}
      onClose={vi.fn()}
      onRefresh={onRefresh}
      onCollect={onCollect}
      {...over}
    />,
  );
  return { onCollect, onRefresh };
}

describe('<CoupangDirectCalendarModal />', () => {
  it('states which intake round and delivery-date range applies', () => {
    renderModal();
    expect(screen.getByText(/2026-07-30\(목\) 접수분/)).toBeInTheDocument();
    expect(screen.getByText('2026-07-30 ~ 2026-08-04')).toBeInTheDocument();
  });

  it('opens on the intake round month, not the current month', () => {
    // 07-31 에 열어도 회차가 08-04 면 8월이 보여야 처리할 날짜를 바로 고를 수 있다.
    render(
      <CoupangDirectCalendarModal
        open loading={false} refreshing={false} hasCapture collectedAt={null} pos={POS} collectedSeqs={new Set()}
        today="2026-07-31" onClose={vi.fn()} onRefresh={vi.fn()} onCollect={vi.fn()}
      />,
    );
    expect(screen.getByText('2026.08')).toBeInTheDocument();
  });

  it('shows one combined order total with a transport breakdown', () => {
    // 탭 없이 쉽먼트+밀크런을 합쳐 보여준다.
    renderModal();
    expect(screen.queryByRole('button', { name: /^밀크런 / })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog').textContent?.replace(/\s+/g, ' '))
      .toContain('발주 3건(쉽먼트 1 · 밀크런 2)');
  });

  it('keeps the total even when an order was already transmitted', () => {
    // 전송 여부는 우리가 확인한 사실이 아니라 요청 기록일 뿐이라 총계에서 빼지 않는다.
    renderModal({ collectedSeqs: new Set(['PO-1']) });
    expect(screen.getByRole('dialog').textContent?.replace(/\s+/g, ' '))
      .toContain('발주 3건(쉽먼트 1 · 밀크런 2)');
  });

  it('collects every transport of the picked delivery dates', () => {
    const { onCollect } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: '2026-07-31 발주 2건' }));
    fireEvent.click(screen.getByRole('button', { name: '선택한 날짜 수집' }));

    expect(onCollect).toHaveBeenCalledWith(['2026-07-31']);
  });

  it('keeps the collect action disabled until a date is picked', () => {
    renderModal();
    expect(screen.getByRole('button', { name: '선택한 날짜 수집' })).toBeDisabled();
  });

  // KID-198: 달력은 마지막 수집분을 보여 줄 뿐이다. 쿠팡을 다시 읽는 일은 운영자가 누를 때만 시작한다.
  it('shows the empty state with a collect button when the account has no capture yet', () => {
    const { onRefresh, onCollect } = renderModal({ hasCapture: false, collectedAt: null, pos: [] });
    expect(screen.getByText('아직 불러온 발주가 없습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '쿠팡에서 발주 불러오기' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '선택한 날짜 수집' })).toBeDisabled();
    expect(onCollect).not.toHaveBeenCalled();
  });

  it('says when the shown capture was collected and offers a fresh read', () => {
    const { onRefresh } = renderModal();
    expect(screen.getByText(/마지막 수집/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('blocks picking and collecting while a fresh read runs', () => {
    renderModal({ refreshing: true });
    expect(screen.getByText(/쿠팡에서 발주를 불러오는 중/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선택한 날짜 수집' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeDisabled();
  });
});
