import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RocketConfirmPanel } from './RocketConfirmPanel';

const api = vi.hoisted(() => ({
  loadSavedRocketPos: vi.fn(),
  previewSavedRocketConfirm: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('../lib/rocket-confirm-api', () => ({
  ROCKET_SHORTAGE_REASONS: ['협력사 재고부족 - 수요예측 오류'],
  commitRocketConfirmRows: vi.fn(),
  collectRocketPoRowsFromExtension: vi.fn(),
  generateRocketConfirmFile: vi.fn(),
  previewRocketConfirm: vi.fn(),
  loadSavedRocketPos: api.loadSavedRocketPos,
  previewSavedRocketConfirm: api.previewSavedRocketConfirm,
}));

vi.mock('@/lib/rocket-confirm-file-store', () => ({
  saveRocketConfirmFile: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { fetchRaw: vi.fn() },
}));

vi.mock('@/lib/browser-download', () => ({
  downloadBlob: vi.fn(),
}));

describe('<RocketConfirmPanel /> integrated date selection', () => {
  beforeEach(() => {
    api.loadSavedRocketPos.mockReset().mockResolvedValue([]);
    api.previewSavedRocketConfirm.mockReset().mockResolvedValue({
      rows: [
        {
          poNumber: 'PO-1',
          barcode: '880000000001',
          productName: '선택일 재고 매칭 상품',
          orderQty: 2,
          available: 2,
          confirmQty: 2,
          shortageReason: '',
          purchasePrice: 1000,
        },
      ],
      totalRows: 1,
      fullyConfirmed: 1,
      shortRows: 0,
      matchedSkus: 1,
    });
  });

  it('uses the integrated calendar date for the saved preview and clears stale preview on deselect', async () => {
    render(
      <RocketConfirmPanel
        onSaved={vi.fn()}
        activeMonth="2026-07"
        onOrdersChanged={vi.fn()}
        renderOrderExplorer={({ onSelectDate }) => (
          <div>
            <button type="button" onClick={() => onSelectDate('2026-07-18')}>7월 18일 선택</button>
            <button type="button" onClick={() => onSelectDate(null)}>날짜 선택 해제</button>
          </div>
        )}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '7월 18일 선택' }));

    await waitFor(() => {
      expect(api.previewSavedRocketConfirm).toHaveBeenCalledWith('2026-07-18');
    });
    expect(await screen.findByText('선택일 재고 매칭 상품')).toBeInTheDocument();
    expect(screen.getByText(/2026-07-18 · 발주 1건 · 1행/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '날짜 선택 해제' }));
    expect(screen.queryByText('선택일 재고 매칭 상품')).not.toBeInTheDocument();
  });
});
