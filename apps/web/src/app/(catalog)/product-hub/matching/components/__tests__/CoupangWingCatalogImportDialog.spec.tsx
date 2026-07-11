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
      statusRefreshFailed: false,
    });
    vi.mocked(useImportCoupangWingCatalog).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as ReturnType<typeof useImportCoupangWingCatalog>);
  });

  it('requires a selected account', () => {
    renderDialog(null);

    expect(screen.getByText('쿠팡 Wing 계정을 먼저 선택해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품 메타데이터 가져오기' })).toBeDisabled();
  });

  it.each([
    account({ channel: 'rocket', name: '쿠팡 Wing 로켓' }),
    account({ channel: 'smartstore', name: '쿠팡 Wing 연동' }),
  ])('rejects a non-coupang account regardless of its display name', (invalidAccount) => {
    renderDialog(invalidAccount);

    expect(screen.getByText('channel이 coupang인 계정만 Wing 파일을 가져올 수 있습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품 메타데이터 가져오기' })).toBeDisabled();
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
    await user.click(screen.getByRole('button', { name: '상품 메타데이터 가져오기' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
      file,
    });
    expect(await screen.findByText('부모 상품 생성 10')).toBeInTheDocument();
    expect(screen.getByText('부모 상품 갱신 20')).toBeInTheDocument();
    expect(screen.getByText('옵션 SKU 생성 30')).toBeInTheDocument();
    expect(screen.getByText('옵션 SKU 갱신 40')).toBeInTheDocument();
    expect(screen.getByText('건너뜀 3')).toBeInTheDocument();
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
        statusRefreshFailed: false,
      },
    );
    const user = userEvent.setup();
    renderDialog();

    await user.upload(
      screen.getByLabelText('쿠팡 Wing 상품 파일'),
      new File(['wing'], 'wing.xls'),
    );
    await user.click(screen.getByRole('button', { name: '상품 메타데이터 가져오기' }));

    expect(await screen.findByText('이미 가져온 동일 파일입니다. 변경된 상품 메타데이터가 없습니다.')).toBeInTheDocument();
  });

  it('keeps the upload error visible for operator recovery', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('업로드 실패'));
    const user = userEvent.setup();
    renderDialog();

    fireEvent.change(screen.getByLabelText('쿠팡 Wing 상품 파일'), {
      target: { files: [new File(['wing'], 'wing.xlsx')] },
    });
    await user.click(screen.getByRole('button', { name: '상품 메타데이터 가져오기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('업로드 실패');
  });

  it('states that import only updates metadata and preserves Sellpia recipes', () => {
    renderDialog();

    expect(
      screen.getByText('이 파일은 쇼핑몰 상품 메타데이터만 갱신하며 기존 Sellpia 구성 매칭은 유지합니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/매칭.*생성/)).not.toBeInTheDocument();
  });

  it('calls success only after the hook has refreshed imported-account statuses', async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    await user.upload(
      screen.getByLabelText('쿠팡 Wing 상품 파일'),
      new File(['wing'], 'wing.xlsx'),
    );
    await user.click(screen.getByRole('button', { name: '상품 메타데이터 가져오기' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.invocationCallOrder[0]).toBeLessThan(
      onSuccess.mock.invocationCallOrder[0],
    );
  });

  it('keeps import counters and shows manual recovery when follow-up status refresh fails', async () => {
    mutateAsync.mockResolvedValueOnce({
      response: response(),
      statusRefreshFailed: true,
    });
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    await user.upload(
      screen.getByLabelText('쿠팡 Wing 상품 파일'),
      new File(['wing'], 'wing.xlsx'),
    );
    await user.click(screen.getByRole('button', { name: '상품 메타데이터 가져오기' }));

    expect(await screen.findByText('상품 메타데이터 가져오기를 완료했습니다.')).toBeInTheDocument();
    expect(screen.getByText('부모 상품 생성 10')).toBeInTheDocument();
    expect(screen.getByText('옵션 SKU 생성 30')).toBeInTheDocument();
    expect(
      screen.getByText(
        "매칭 상태만 새로고치지 못했습니다. 목록 상태가 오래되었을 수 있으니 창을 닫고 '상태 새로고침'을 눌러 주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/파일을 다시.*가져/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Wing 상품 파일을 가져오지 못했습니다/)).not.toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ duplicate: false }),
    );
  });
});
