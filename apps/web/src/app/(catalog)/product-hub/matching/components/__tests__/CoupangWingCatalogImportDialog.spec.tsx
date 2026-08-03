import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImportCoupangWingCatalog } from '../../hooks/useChannelSkuMappings';
import { CoupangWingCatalogImportDialog } from '../CoupangWingCatalogImportDialog';
import type { ChannelAccountListItem } from '@kiditem/shared/channel-account';
import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';

vi.mock('../../hooks/useChannelSkuMappings', () => ({
  useImportCoupangWingCatalog: vi.fn(),
}));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const now = '2026-07-11T00:00:00.000Z';

function account(
  overrides: Partial<ChannelAccountListItem> = {},
): ChannelAccountListItem {
  return {
    id: ACCOUNT_ID,
    channel: 'coupang',
    name: '쿠팡 Wing',
    externalAccountId: null,
    vendorId: null,
    sellerId: null,
    isPrimary: true,
    ...overrides,
  };
}

function response(
  overrides: Partial<CoupangWingCatalogImportResponse> = {},
): CoupangWingCatalogImportResponse {
  return {
    run: {
      id: '22222222-2222-4222-8222-222222222222',
      sourceType: 'coupang_wing_catalog',
      channelAccountId: ACCOUNT_ID,
      fileName: 'wing.xlsx',
      fileHash: 'a'.repeat(64),
      status: 'completed',
      rowCount: 3,
      importedAt: now,
      lastVerifiedAt: null,
      verificationCount: 0,
      lastTrigger: null,
      freshnessGeneration: null,
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: null,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    },
    duplicate: false,
    changes: {
      createdProductCount: 10,
      updatedProductCount: 20,
      createdSkuCount: 30,
      updatedSkuCount: 40,
      skippedRowCount: 3,
    },
    ...overrides,
  };
}

const mutateAsync = vi.fn();

function renderDialog(
  selectedAccount: ChannelAccountListItem | null = account(),
  onSuccess = vi.fn(),
) {
  render(
    <CoupangWingCatalogImportDialog
      open
      account={selectedAccount}
      onOpenChange={vi.fn()}
      onSuccess={onSuccess}
    />,
  );
  return { onSuccess };
}

describe('CoupangWingCatalogImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({
      response: response(),
      automaticMatching: automaticMatching(),
    });
    vi.mocked(useImportCoupangWingCatalog).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useImportCoupangWingCatalog>);
  });

  it('requires a selected account', () => {
    renderDialog(null);

    expect(screen.getByText('쿠팡 Wing 계정을 먼저 선택해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품·재고 가져오기' })).toBeDisabled();
  });

  it.each([
    account({ channel: 'rocket', name: '쿠팡 Wing 로켓' }),
    account({ channel: 'smartstore', name: '쿠팡 Wing 연동' }),
  ])('rejects a non-coupang account regardless of its display name', (invalidAccount) => {
    renderDialog(invalidAccount);

    expect(screen.getByText('channel이 coupang인 계정만 Wing 파일을 가져올 수 있습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품·재고 가져오기' })).toBeDisabled();
  });

  it('accepts only xlsx and xls workbook extensions in the picker', () => {
    renderDialog();

    expect(screen.getByLabelText('쿠팡 Wing 상품 파일')).toHaveAttribute(
      'accept',
      '.xlsx,.xls',
    );
  });

  it('uploads the selected workbook and reports every create/update/skip count', async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();
    const file = new File(['wing'], 'wing.xlsx');

    await user.upload(screen.getByLabelText('쿠팡 Wing 상품 파일'), file);
    await user.click(screen.getByRole('button', { name: '상품·재고 가져오기' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
      file,
    });
    expect(await screen.findByText('부모 상품 생성 10')).toBeInTheDocument();
    expect(screen.getByText('부모 상품 갱신 20')).toBeInTheDocument();
    expect(screen.getByText('옵션 SKU 생성 30')).toBeInTheDocument();
    expect(screen.getByText('옵션 SKU 갱신 40')).toBeInTheDocument();
    expect(screen.getByText('건너뜀 3')).toBeInTheDocument();
    expect(screen.getByText('자동 재고 연결 7')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ duplicate: false }));
  });

  it('clearly reports an identical duplicate as a no-op', async () => {
    mutateAsync.mockResolvedValueOnce(
      {
        response: response({
          duplicate: true,
          changes: {
            createdProductCount: 0,
            updatedProductCount: 0,
            createdSkuCount: 0,
            updatedSkuCount: 0,
            skippedRowCount: 0,
          },
        }),
        automaticMatching: automaticMatching(),
      },
    );
    const user = userEvent.setup();
    renderDialog();

    await user.upload(
      screen.getByLabelText('쿠팡 Wing 상품 파일'),
      new File(['wing'], 'wing.xls'),
    );
    await user.click(screen.getByRole('button', { name: '상품·재고 가져오기' }));

    expect(await screen.findByText('이미 가져온 동일 파일입니다. 상품·옵션 변경 없이 자동 재고 연결만 다시 확인했습니다.')).toBeInTheDocument();
  });

  it('keeps the upload error visible for operator recovery', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('업로드 실패'));
    const user = userEvent.setup();
    renderDialog();

    fireEvent.change(screen.getByLabelText('쿠팡 Wing 상품 파일'), {
      target: { files: [new File(['wing'], 'wing.xlsx')] },
    });
    await user.click(screen.getByRole('button', { name: '상품·재고 가져오기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('업로드 실패');
  });

  it('states that import configures empty options and preserves confirmed inventory connections', () => {
    renderDialog();

    expect(
      screen.getByText('셀피아의 현재 상품 매칭과 차감 수량을 함께 확인해 비어 있는 옵션 재고 연결을 자동으로 설정합니다. 이미 확정한 재고 연결은 변경하지 않습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품·재고 가져오기' })).toBeInTheDocument();
  });

  it('calls success only after the hook completes the automatic matching workflow', async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    await user.upload(
      screen.getByLabelText('쿠팡 Wing 상품 파일'),
      new File(['wing'], 'wing.xlsx'),
    );
    await user.click(screen.getByRole('button', { name: '상품·재고 가져오기' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.invocationCallOrder[0]).toBeLessThan(
      onSuccess.mock.invocationCallOrder[0],
    );
  });

  it('keeps import counters and shows recovery when automatic inventory matching fails', async () => {
    mutateAsync.mockResolvedValueOnce({
      response: response(),
      automaticMatching: automaticMatching({
        configuredOptions: 0,
        error: 'Sellpia 로그인이 필요합니다.',
      }),
    });
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    await user.upload(
      screen.getByLabelText('쿠팡 Wing 상품 파일'),
      new File(['wing'], 'wing.xlsx'),
    );
    await user.click(screen.getByRole('button', { name: '상품·재고 가져오기' }));

    expect(await screen.findByText('상품·옵션 가져오기를 완료했습니다.')).toBeInTheDocument();
    expect(screen.getByText('부모 상품 생성 10')).toBeInTheDocument();
    expect(screen.getByText('옵션 SKU 생성 30')).toBeInTheDocument();
    expect(
      screen.getByText(
        '상품·옵션 가져오기는 완료했지만 자동 재고 연결을 마치지 못했습니다. Sellpia 로그인이 필요합니다.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('자동 재고 연결 0')).toBeInTheDocument();
    expect(screen.queryByText(/Wing 상품 파일을 가져오지 못했습니다/)).not.toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ duplicate: false }),
    );
  });
});

function automaticMatching(overrides: Partial<{
  collectedAliases: number;
  evaluatedListings: number;
  matchedListings: number;
  configuredOptions: number;
  error: string | null;
}> = {}) {
  return {
    collectedAliases: 21,
    evaluatedListings: 30,
    matchedListings: 0,
    configuredOptions: 7,
    error: null,
    ...overrides,
  };
}
