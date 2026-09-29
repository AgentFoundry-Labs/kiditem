import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GeneratedFilesSection } from './GeneratedFilesSection';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';
import { todayYmd } from '../lib/order-collection-page-model';

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
    collectionDate: 'collectionDate' in overrides
      ? overrides.collectionDate
      : '2026-07-14',
    mallKey: overrides.mallKey,
    mallName: overrides.mallName,
    orderNumbers: overrides.orderNumbers,
    transmissionRequestedAt: overrides.transmissionRequestedAt,
    fileKind: overrides.fileKind,
    // 원천 실행이 있는 새 기록이 기본이다 — 옛 기록은 테스트가 undefined로 준다(KID-366).
    sourceOperationId: 'sourceOperationId' in overrides ? overrides.sourceOperationId : `operation-${id}`,
    sellpiaTransferConfirmationId: overrides.sellpiaTransferConfirmationId,
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
    onConfirmSellpiaTransfer: vi.fn(),
    onCloseSellpiaTransfer: vi.fn(),
  };

  render(
    <GeneratedFilesSection
      items={items}
      bulkAction={null}
      lockedFileIds={new Set()}
      sellpiaSendingId={null}
      sellpiaPostProcessing={false}
      {...callbacks}
    />,
  );

  return callbacks;
}

describe('GeneratedFilesSection', () => {
  it('keeps visible spacing between the created-at and action columns', () => {
    renderSection([generatedFile('spacing')]);

    expect(screen.getByRole('columnheader', { name: '생성시각' })).toHaveClass('pr-6');
    expect(screen.getByRole('columnheader', { name: '작업' })).toHaveClass('pl-6');
  });

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

  it('selects every file created today across pages and sends only eligible files', async () => {
    const user = userEvent.setup();
    const today = todayYmd();
    const todayItems = Array.from({ length: 21 }, (_, index) =>
      generatedFile(`today-${index}`, {
        collectionDate: today,
        convertedAt: Date.now() - index,
        ...(index === 3 ? { transmissionRequestedAt: 200 } : {}),
      }),
    );
    const legacyTodayItem = generatedFile('legacy-today', {
      collectionDate: undefined,
      convertedAt: Date.now(),
    });
    const oldItem = generatedFile('old', { collectionDate: '2026-07-01' });
    const callbacks = renderSection([...todayItems, legacyTodayItem, oldItem]);

    await user.click(
      screen.getByRole('checkbox', { name: '오늘 생성 파일 전체 선택 (22개)' }),
    );

    expect(screen.getByRole('button', { name: '선택 다운로드 (22)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '선택 전송 요청 (21)' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '선택 전송 요청 (21)' }));
    expect(callbacks.onSendSelectedToSellpia).toHaveBeenCalledWith([
      ...todayItems.filter((item) => item.transmissionRequestedAt === undefined),
      legacyTodayItem,
    ]);
  });

  it('shows tracking artifacts without offering Sellpia order transmission', async () => {
    const user = userEvent.setup();
    const order = generatedFile('order');
    const tracking = generatedFile('tracking', {
      fileName: '아트공구_송장_20260727.csv',
      fileKind: 'tracking',
      collectionMode: 'tracking',
      mallKey: 'art09',
      mallName: '아트공구',
    });
    const callbacks = renderSection([order, tracking]);

    expect(screen.getByText('송장 업로드')).toBeInTheDocument();
    expect(screen.getByText('파일 생성됨')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '셀피아 전송 요청' })).toHaveLength(1);

    await user.click(screen.getByRole('checkbox', { name: 'order.xlsx 선택' }));
    await user.click(screen.getByRole('checkbox', { name: '아트공구_송장_20260727.csv 선택' }));
    await user.click(screen.getByRole('button', { name: '선택 전송 요청 (1)' }));

    expect(callbacks.onSendSelectedToSellpia).toHaveBeenCalledWith([order]);
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

  it('locks only queued files and keeps a disjoint row actionable', () => {
    const items = [generatedFile('active'), generatedFile('queued'), generatedFile('free')];
    render(
      <GeneratedFilesSection
        items={items}
        bulkAction="send"
        lockedFileIds={new Set(['active', 'queued'])}
        sellpiaSendingId="active"
        sellpiaPostProcessing={false}
        onDelete={vi.fn()}
        onDeleteSelected={vi.fn()}
        onDownload={vi.fn()}
        onDownloadSelected={vi.fn()}
        onPreview={vi.fn()}
        onSellpiaPostProcess={vi.fn()}
        onSendSelectedToSellpia={vi.fn()}
        onSendToSellpia={vi.fn()}
        onConfirmSellpiaTransfer={vi.fn()}
        onCloseSellpiaTransfer={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '전송 중' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '전송 대기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'active.xlsx 삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'queued.xlsx 삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'free.xlsx 삭제' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: '셀피아 전송 요청' }))
      .toHaveLength(1);
  });

  it('원천 실행 id가 없는 옛 기록은 셀피아 전송을 막고 다시 수집하라고 말한다', () => {
    renderSection([generatedFile('legacy', { sourceOperationId: undefined })]);

    expect(screen.getByRole('button', { name: '셀피아 전송 요청' })).toBeDisabled();
    expect(screen.getByText('다시 수집')).toBeInTheDocument();
  });

  it('제출했지만 접수를 확인하지 못한 전송은 셀피아 확인 필요로 보여 주고 확인·닫기를 받는다', async () => {
    const user = userEvent.setup();
    const item = generatedFile('reconciling', { sellpiaTransferConfirmationId: 'operation-transfer' });
    const callbacks = renderSection([item]);

    expect(screen.getByText('셀피아 확인 필요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '셀피아 전송 요청' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '접수됨 확인' }));
    await user.click(screen.getByRole('button', { name: '미접수로 닫기' }));
    expect(callbacks.onConfirmSellpiaTransfer).toHaveBeenCalledWith(item);
    expect(callbacks.onCloseSellpiaTransfer).toHaveBeenCalledWith(item);
  });
});
