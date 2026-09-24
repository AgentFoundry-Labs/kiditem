import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { registrationTargetApi } from '@/lib/registration-target-api';
import type { MallPublishAdapter } from './mall-publish-adapter';
import { RegistrationConfirmDialog } from './RegistrationConfirmDialog';

vi.mock('@/lib/api-client', () => ({ apiClient: { getParsed: vi.fn() } }));
vi.mock('@/lib/registration-target-api', () => ({
  registrationTargetApi: { list: vi.fn() },
  registrationTargetKeys: { list: (id: string) => ['registration-targets', 'list', id] },
}));

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_A = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_B = '33333333-3333-4333-8333-333333333333';
const OTHER_MALL_ACCOUNT = '44444444-4444-4444-8444-444444444444';
const SKU_ID = '55555555-5555-4555-8555-555555555555';

/** 몰 이름을 모르는 공통 확인 창이라 가짜 몰 어댑터로 본다. */
function adapter(overrides: Partial<NonNullable<MallPublishAdapter['confirmation']>> = {}): MallPublishAdapter {
  return {
    mallKey: 'test-mall',
    mallName: '시험몰',
    mode: 'form',
    batchSize: 1,
    requiresOperatorSubmit: false,
    fields: [{
      key: 'category',
      label: '시험몰 분류',
      origin: 'override',
      control: 'select',
      options: [{ value: '', label: '고르세요' }, { value: 'toy', label: '완구' }],
      defaultValue: '',
      required: true,
    }, { key: 'brand', label: '브랜드', origin: 'template', control: 'text', defaultValue: '노브랜드', required: true }],
    preview: () => [],
    validate: () => [],
    send: vi.fn(),
    confirmation: {
      fields: [{ key: 'displayName', label: '노출 이름', origin: 'override', control: 'text', defaultValue: '', required: true }],
      sellpiaMatch: true,
      loadDefaults: vi.fn(async () => ({
        values: { category: 'toy', displayName: '기본 이름' },
        notes: ['기존 등록상품과 비슷해 분류를 골랐습니다'],
      })),
      validate: (values) => (values.displayName?.trim() ? [] : ['노출 이름을 넣으세요.']),
      ...overrides,
    },
  };
}

function account(id: string, channel: string, name: string) {
  return { id, channel, name, externalAccountId: null, vendorId: `V-${name}`, sellerId: null, isPrimary: false };
}

function renderDialog(props: Partial<Parameters<typeof RegistrationConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  render(
    <RegistrationConfirmDialog
      adapter={adapter()}
      salesProductId={PRODUCT_ID}
      isSubmitting={false}
      onCancel={() => {}}
      onConfirm={onConfirm}
      onSearchSellpia={async () => [{ masterProductId: SKU_ID, code: '10451-1', name: '꿀사과', optionName: null, currentStock: 13 }]}
      {...props}
    />,
    { wrapper },
  );
  return onConfirm;
}

describe('RegistrationConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getParsed).mockResolvedValue([
      account(ACCOUNT_A, 'test-mall', '본점'),
      account(OTHER_MALL_ACCOUNT, 'other-mall', '다른몰'),
    ] as never);
    vi.mocked(registrationTargetApi.list).mockResolvedValue([{
      id: 'target-1', channelAccountId: ACCOUNT_A, registrationInput: { adapter: { 'test-mall': { category: 'toy' } } },
    }] as never);
  });
  afterEach(cleanup);

  it('picks the account that already holds this product’s registration target when the mall has several', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue([
      account(ACCOUNT_B, 'test-mall', '지점'),
      account(ACCOUNT_A, 'test-mall', '본점'),
    ] as never);
    renderDialog();
    await screen.findByDisplayValue('기본 이름');

    expect(screen.getByRole('combobox', { name: '시험몰 계정' })).toHaveValue(ACCOUNT_A);
  });

  it('asks only for this mall’s accounts and the adapter’s fields, with the adapter’s defaults and notes', async () => {
    const withAdapter = adapter();
    renderDialog({ adapter: withAdapter });

    expect(await screen.findByDisplayValue('기본 이름')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '시험몰 계정' })).toHaveValue(ACCOUNT_A);
    expect(screen.queryByRole('option', { name: '다른몰' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '시험몰 분류' })).toHaveValue('toy');
    expect(screen.queryByRole('textbox', { name: '브랜드' })).not.toBeInTheDocument();
    expect(screen.getByText('기존 등록상품과 비슷해 분류를 골랐습니다')).toBeInTheDocument();
    expect(withAdapter.confirmation?.loadDefaults).toHaveBeenCalledWith({
      salesProductId: PRODUCT_ID,
      savedInputs: [{ category: 'toy' }],
    });
  });

  it('fills the form only by default — the confirm button says so and asks for no submit', async () => {
    const onConfirm = renderDialog();
    await screen.findByDisplayValue('기본 이름');

    fireEvent.click(screen.getByRole('button', { name: '폼 채우기' }));

    expect(onConfirm).toHaveBeenCalledWith({
      submit: false,
      channelAccount: expect.objectContaining({ id: ACCOUNT_A, vendorId: 'V-본점' }),
      values: { category: 'toy', displayName: '기본 이름' },
      adapterValues: {},
    });
  });

  it('runs the fenced registration only when asked, and sends the Sellpia pick as `sellpiaInventorySkuId`', async () => {
    const onConfirm = renderDialog();
    await screen.findByDisplayValue('기본 이름');

    fireEvent.change(screen.getByRole('searchbox', { name: '셀피아 재고 검색' }), { target: { value: '꿀사과' } });
    fireEvent.click(screen.getByRole('button', { name: '셀피아 검색' }));
    fireEvent.click(await screen.findByRole('button', { name: '10451-1 꿀사과 선택' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: '판매 1개당 셀피아 차감수량' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /등록 실행까지/ }));
    fireEvent.click(screen.getByRole('button', { name: '등록 실행' }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      submit: true,
      adapterValues: { sellpiaInventorySkuId: SKU_ID, sellpiaQuantity: '2' },
    }));
    expect(JSON.stringify(onConfirm.mock.calls[0]![0])).not.toContain('masterProductId');
  });

  it('keeps the confirm button closed while the adapter or the account says no', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue([
      account(ACCOUNT_A, 'test-mall', '본점'),
      account(ACCOUNT_B, 'test-mall', '지점'),
    ] as never);
    vi.mocked(registrationTargetApi.list).mockResolvedValue([]);
    const onConfirm = renderDialog();
    await screen.findByDisplayValue('기본 이름');

    expect(screen.getByRole('combobox', { name: '시험몰 계정' })).toHaveValue('');
    expect(screen.getByText('시험몰 계정을 고르세요.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '시험몰 계정' }), { target: { value: ACCOUNT_B } });
    fireEvent.change(screen.getByRole('textbox', { name: '노출 이름' }), { target: { value: ' ' } });

    expect(screen.getByText('노출 이름을 넣으세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '폼 채우기' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows no Sellpia section for an adapter that does not link one', async () => {
    renderDialog({ adapter: adapter({ sellpiaMatch: false }) });
    await screen.findByDisplayValue('기본 이름');

    expect(screen.queryByRole('region', { name: '셀피아 상품 연결' })).not.toBeInTheDocument();
  });

  it('renders nothing for an adapter without a confirmation', async () => {
    const plain = { ...adapter(), confirmation: undefined };
    renderDialog({ adapter: plain });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
