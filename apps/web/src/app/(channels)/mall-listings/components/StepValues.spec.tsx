import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StepValues } from './StepValues';
import type { MallPublishAdapter, MallPublishItem } from '../../_shared/mall-publish-adapter';
import type { RegistrationTarget } from '@kiditem/shared/sales-product';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

const item: MallPublishItem = {
  candidateId: PRODUCT_ID,
  name: '상품 A',
  salePrice: 5000,
  thumbnailUrl: null,
  source: 'sales_product',
};

const adapter: MallPublishAdapter = {
  mallKey: 'kidsnote',
  mallName: '키즈노트',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: [],
  preview: () => [],
  validate: () => [],
  send: async () => ({ ok: true, confirmed: false, manualSteps: [], warnings: [] }),
};

function target(id: string, channelAccountId: string, displayName: string): RegistrationTarget {
  return {
    id,
    salesProductId: PRODUCT_ID,
    channelAccountId,
    version: 1,
    displayName,
    registrationInput: {},
    selectedOptions: [],
    resolved: { name: '상품 A', options: [] },
  };
}

function renderStep(targets: RegistrationTarget[]) {
  render(
    <StepValues
      adapters={[adapter]}
      items={[item]}
      activeMallKey="kidsnote"
      valuesByMall={{}}
      blocks={[]}
      channelAccountId={ACCOUNT_ID}
      registrationTargetsByItem={{ [PRODUCT_ID]: targets }}
      selectedRegistrationTargetIds={{}}
      onSelectMall={() => undefined}
      onChangeValue={() => undefined}
      onSelectRegistrationTarget={() => undefined}
    />,
  );
}

describe('StepValues registration target choice', () => {
  it('shows exact-account choices only when the item has multiple saved settings', () => {
    renderStep([
      target('target-a', ACCOUNT_ID, '첫 설정'),
      target('target-b', ACCOUNT_ID, '둘째 설정'),
      target('target-other-account', OTHER_ACCOUNT_ID, '다른 계정'),
    ]);

    const select = screen.getByRole('combobox', { name: '상품 A 등록 설정' });
    expect(within(select).getAllByRole('option').map((option) => (option as HTMLOptionElement).value)).toEqual([
      '', 'target-a', 'target-b',
    ]);
  });

  it('keeps zero-or-one settings out of the normal registration screen', () => {
    renderStep([target('target-a', ACCOUNT_ID, '첫 설정')]);

    expect(screen.queryByRole('region', { name: '키즈노트 등록 설정' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: '상품 A 등록 설정' })).toBeNull();
  });
});
