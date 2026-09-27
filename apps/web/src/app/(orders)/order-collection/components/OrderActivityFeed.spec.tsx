import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';
import { OrderActivityFeed } from './OrderActivityFeed';

function generatedFile(
  overrides: Partial<StoredOrderCollectionFile> = {},
): StoredOrderCollectionFile {
  return {
    id: overrides.id ?? 'orders-1',
    fileName: overrides.fileName ?? 'orders.xlsx',
    sourceName: overrides.sourceName ?? 'orders.csv',
    blob: overrides.blob ?? new Blob(['orders']),
    previewRows: overrides.previewRows ?? [],
    sourceRows: overrides.sourceRows ?? 2,
    productRows: overrides.productRows ?? 1,
    outputRows: overrides.outputRows ?? 2,
    skippedRows: overrides.skippedRows ?? 0,
    convertedAt: overrides.convertedAt ?? Date.UTC(2026, 6, 14, 1),
    mallName: overrides.mallName ?? '키드키즈',
    transmissionRequestedAt: overrides.transmissionRequestedAt,
  };
}

describe('OrderActivityFeed', () => {
  it('names a successful extension click as a Sellpia transmission request', () => {
    render(
      <OrderActivityFeed
        history={[generatedFile({ transmissionRequestedAt: Date.UTC(2026, 6, 14, 2) })]}
      />,
    );

    expect(screen.getByText('셀피아 전송 요청 · 키드키즈')).toBeInTheDocument();
    expect(screen.queryByText(/전송 완료/)).not.toBeInTheDocument();
  });

  it('keeps raw mall collection distinct from Sellpia transmission', () => {
    render(<OrderActivityFeed history={[generatedFile()]} />);

    expect(screen.getByText('수집·변환 1건')).toBeInTheDocument();
    expect(screen.queryByText(/셀피아 전송 요청/)).not.toBeInTheDocument();
  });

  it('이미 변환된 주문을 다시 수집해 파일을 재사용하면 그 건수로 최근 활동에 남는다(실기기 R6)', () => {
    render(<OrderActivityFeed history={[]} events={[{ id: 'e1', kind: 'reused', mallName: '해법몰', message: '', at: Date.UTC(2026, 8, 27, 5), orders: 1 }]} />);
    expect(screen.getByText('이미 변환된 주문 1건 (파일 재사용) · 해법몰')).toBeInTheDocument();
  });
});
