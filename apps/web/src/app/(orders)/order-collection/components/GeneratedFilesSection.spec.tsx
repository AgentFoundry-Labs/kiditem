import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GeneratedFilesSection } from './GeneratedFilesSection';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';

function generatedFile(
  id: string,
  overrides: Partial<StoredOrderCollectionFile> = {},
): StoredOrderCollectionFile {
  return {
    id,
    fileName: overrides.fileName ?? `${id}.xlsx`,
    sourceName: overrides.sourceName ?? `${id}-source.csv`,
    blob: overrides.blob ?? new Blob([id]),
    previewRows: overrides.previewRows ?? [],
    sourceRows: overrides.sourceRows ?? 1,
    productRows: overrides.productRows ?? 1,
    outputRows: overrides.outputRows ?? 2,
    skippedRows: overrides.skippedRows ?? 0,
    convertedAt: overrides.convertedAt ?? 100,
    collectionDate: overrides.collectionDate ?? '2026-07-14',
    mallKey: overrides.mallKey,
    mallName: overrides.mallName,
    orderNumbers: overrides.orderNumbers,
    transmissionRequestedAt: overrides.transmissionRequestedAt,
  };
}

function renderSection(items: StoredOrderCollectionFile[]) {
  const callbacks = {
    onDelete: vi.fn(),
    onDeleteSelected: vi.fn(),
    onDownload: vi.fn(),
    onDownloadSelected: vi.fn(),
    onPreview: vi.fn(),
    onSellpiaPostProcess: vi.fn(),
    onSendSelectedToSellpia: vi.fn(),
    onSendToSellpia: vi.fn(),
  };

  render(
    <GeneratedFilesSection
      items={items}
      bulkAction={null}
      sellpiaSendingId={null}
      sellpiaPostProcessing={false}
      {...callbacks}
    />,
  );

  return callbacks;
}

describe('GeneratedFilesSection', () => {
  it('filters by search, mall, and Sellpia status without losing the full count', async () => {
    const user = userEvent.setup();
    renderSection([
      generatedFile('sent', {
        fileName: '아이스크림-전송.xlsx',
        mallKey: 'icecream-mall',
        mallName: '아이스크림몰',
        transmissionRequestedAt: Date.UTC(2026, 6, 14, 1),
      }),
      generatedFile('unsent', {
        fileName: '키드키즈-대기.xlsx',
        mallKey: 'kidkids',
        mallName: '키드키즈',
        previewRows: [['수령인', '홍길동']],
      }),
    ]);

    expect(screen.getByText('2 / 2개')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: '생성 파일 검색' }), '홍길동');
    expect(screen.getByText('키드키즈-대기.xlsx')).toBeInTheDocument();
    expect(screen.queryByText('아이스크림-전송.xlsx')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: '생성 파일 검색' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '전송 상태 필터' }), 'requested');
    expect(screen.getByText('전송 요청됨')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: '몰 필터' }), 'kidkids');
    expect(screen.getByText('조건에 맞는 생성 파일이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('0 / 2개')).toBeInTheDocument();
  });

  it('selects rows and delegates supported bulk actions', async () => {
    const user = userEvent.setup();
    const items = [generatedFile('a'), generatedFile('b', { transmissionRequestedAt: 200 })];
    const callbacks = renderSection(items);

    await user.click(screen.getByRole('checkbox', { name: 'a.xlsx 선택' }));
    await user.click(screen.getByRole('button', { name: '선택 전송 요청 (1)' }));
    expect(callbacks.onSendSelectedToSellpia).toHaveBeenCalledWith([items[0]]);

    await user.click(screen.getByRole('button', { name: '선택 다운로드 (1)' }));
    expect(callbacks.onDownloadSelected).toHaveBeenCalledWith([items[0]]);
    await user.click(screen.getByRole('button', { name: '선택 삭제 (1)' }));
    expect(callbacks.onDeleteSelected).toHaveBeenCalledWith([items[0]]);
  });

  it('renders at most twenty rows and pages through the filtered result', async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 21 }, (_, index) =>
      generatedFile(`file-${index}`, { convertedAt: index }),
    );
    renderSection(items);

    expect(screen.getByText('1 / 2 페이지')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: /\.xlsx 선택$/ })).toHaveLength(20);
    expect(screen.queryByText('file-0.xlsx')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(screen.getByText('file-0.xlsx')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: /\.xlsx 선택$/ })).toHaveLength(1);
  });

  it('disables every send trigger while another send is active', () => {
    const item = generatedFile('busy');
    render(
      <GeneratedFilesSection
        items={[item]}
        bulkAction={null}
        sellpiaSendingId={item.id}
        sellpiaPostProcessing={false}
        onDelete={vi.fn()}
        onDeleteSelected={vi.fn()}
        onDownload={vi.fn()}
        onDownloadSelected={vi.fn()}
        onPreview={vi.fn()}
        onSellpiaPostProcess={vi.fn()}
        onSendSelectedToSellpia={vi.fn()}
        onSendToSellpia={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '전송 중' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'busy.xlsx 삭제' })).toBeDisabled();
  });
});
