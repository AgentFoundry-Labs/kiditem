import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelAccountListItem } from '@kiditem/shared/channel-account';
import { useImportChannelCatalog } from '../../hooks/useChannelSkuMappings';
import { ChannelCatalogImportDialog } from '../ChannelCatalogImportDialog';

vi.mock('../../hooks/useChannelSkuMappings', () => ({
  useImportChannelCatalog: vi.fn(),
}));

const WING_ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  channel: 'coupang',
  name: '쿠팡 Wing',
  externalAccountId: null,
  vendorId: null,
  sellerId: null,
  isPrimary: true,
} satisfies ChannelAccountListItem;

const ROCKET_ACCOUNT = {
  id: '22222222-2222-4222-8222-222222222222',
  channel: 'rocket',
  name: '쿠팡 로켓',
  externalAccountId: null,
  vendorId: null,
  sellerId: null,
  isPrimary: true,
} satisfies ChannelAccountListItem;

const mutateAsync = vi.fn();

function renderDialog(defaultAccount: ChannelAccountListItem | null = ROCKET_ACCOUNT) {
  render(
    <ChannelCatalogImportDialog
      open
      accounts={[WING_ACCOUNT, ROCKET_ACCOUNT]}
      defaultAccount={defaultAccount}
      onOpenChange={vi.fn()}
      onSuccess={vi.fn()}
    />,
  );
}

describe('ChannelCatalogImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({
      response: {
        duplicate: false,
        changes: {
          createdProductCount: 1,
          updatedProductCount: 0,
          createdSkuCount: 1,
          updatedSkuCount: 0,
        },
      },
      automaticMatching: { collectedAliases: 0, evaluatedListings: 0, matchedListings: 0, configuredOptions: 0, error: null },
    });
    vi.mocked(useImportChannelCatalog).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useImportChannelCatalog>);
  });

  it('defaults to the selected Rocket account and accepts its matching CSV', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByRole('combobox', { name: '가져올 채널' })).toHaveValue('rocket');
    expect(screen.getByRole('combobox', { name: '가져올 계정' })).toHaveValue(ROCKET_ACCOUNT.id);
    const fileInput = screen.getByLabelText('쿠팡 Rocket 매칭 CSV 파일');
    expect(fileInput).toHaveAttribute('accept', '.csv');

    const file = new File(['rocket'], 'rocket443-sellpia-matching.csv', { type: 'text/csv' });
    await user.upload(fileInput, file);
    await user.click(screen.getByRole('button', { name: '상품·재고 가져오기' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      source: 'rocket',
      channelAccountId: ROCKET_ACCOUNT.id,
      file,
    });
  });

  it('switches the same dialog to Wing and accepts only Excel workbooks', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(screen.getByRole('combobox', { name: '가져올 채널' }), 'wing');

    expect(screen.getByRole('combobox', { name: '가져올 계정' })).toHaveValue(WING_ACCOUNT.id);
    expect(screen.getByLabelText('쿠팡 Wing 상품 엑셀 파일')).toHaveAttribute('accept', '.xlsx,.xls');
    expect(screen.queryByLabelText('쿠팡 Rocket 매칭 CSV 파일')).not.toBeInTheDocument();
  });
});
