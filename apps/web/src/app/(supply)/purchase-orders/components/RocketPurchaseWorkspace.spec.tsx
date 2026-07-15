import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectRocketPoRowsFromExtension } from '@/lib/rocket-sales-collection';
import { previewRocketPurchases } from '../lib/rocket-purchase-preview-api';
import { RocketPurchaseWorkspace } from './RocketPurchaseWorkspace';

vi.mock('@/lib/rocket-sales-collection', () => ({
  collectRocketPoRowsFromExtension: vi.fn(),
}));
vi.mock('../lib/rocket-purchase-preview-api', () => ({
  previewRocketPurchases: vi.fn(),
}));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

describe('RocketPurchaseWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 0,
        failedPoNumbers: [],
      },
      rows: [],
      poCount: 0,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      rows: [],
    });
  });

  it('offers recalculation but keeps actual confirmation disabled in 0.1.19', () => {
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    expect(screen.getByRole('button', { name: '미리보기 다시 계산' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '로켓 발주 확정' })).toBeDisabled();
    expect(screen.getByText('0.1.19에서는 검토만 가능')).toBeInTheDocument();
  });

  it('collects evidence then sends only a preview action', async () => {
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(collectRocketPoRowsFromExtension).toHaveBeenCalledTimes(1);
    expect(previewRocketPurchases).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: ACCOUNT_ID,
      editedQuantities: {},
    }));
    expect(screen.queryByText(/예약 완료|확정 파일 생성|제출 완료/)).not.toBeInTheDocument();
  });
});
