import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  RocketMatchStatusModal,
  rocketMatchStateLabel,
  type RocketMatchStatusRow,
} from './RocketMatchStatusModal';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

describe('<RocketMatchStatusModal />', () => {
  it('shows the four canonical states and links blockers to their exact Product Hub option', () => {
    render(
      <RocketMatchStatusModal
        open
        onClose={vi.fn()}
        rows={[
          row('mapping_required', '상품 연결 필요', '11111111-2222-4222-8222-111111111111'),
          row('configuration_required', '재고 구성 필요', '22222222-2222-4222-8222-222222222222'),
          row('review_required', '레시피 검토 필요', '33333333-2222-4222-8222-333333333333'),
          row('collection_incomplete', '수집 검증 필요', '55555555-2222-4222-8222-555555555555'),
          row('insufficient_capacity', '구성 완료', '44444444-2222-4222-8222-444444444444'),
        ]}
        date="2026-07-22"
        channelAccountId={ACCOUNT_ID}
      />,
    );

    expect(screen.getAllByText('상품 연결 필요').length).toBeGreaterThan(0);
    expect(screen.getAllByText('재고 구성 필요').length).toBeGreaterThan(0);
    expect(screen.getAllByText('레시피 검토 필요').length).toBeGreaterThan(0);
    expect(screen.getAllByText('수집 검증 필요').length).toBeGreaterThan(0);
    expect(screen.getAllByText('구성 완료').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '상품 연결 필요 해결' })).toHaveAttribute(
      'href',
      `/product-hub/matching?channelAccountId=${ACCOUNT_ID}&search=PRODUCT-mapping_required&focusOptionId=11111111-2222-4222-8222-111111111111`,
    );
    expect(screen.getByRole('link', { name: '상품 연결 필요 해결' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('columnheader', { name: '현재고' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '약정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '가용재고' })).not.toBeInTheDocument();
    expect(rocketMatchStateLabel('collection_incomplete')).toBe('수집 검증 필요');
    expect(rocketMatchStateLabel('vendor_mismatch')).toBe('공급사 검증 필요');
  });
});

function row(
  reason: RocketMatchStatusRow['reason'],
  productName: string,
  channelSkuId: string,
): RocketMatchStatusRow {
  return {
    poLineId: `PO-1:${reason}`,
    poNumber: 'PO-1',
    productNo: `PRODUCT-${reason}`,
    productName,
    barcode: '8800000000001',
    orderQuantity: 3,
    reason,
    channelSkuId,
    components: reason === 'insufficient_capacity' ? [{
      sellpiaInventorySkuId: '99999999-9999-4999-8999-999999999999',
      quantity: 1,
      currentStock: 2,
      isActive: true,
    }] : [],
  };
}
