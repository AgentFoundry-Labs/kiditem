import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { executeTargetMallPrice } from '../lib/mall-price-execution';
import { ChannelListingsSection } from './ChannelListingsSection';
import type { RegistrationTarget, SalesProduct } from '@kiditem/shared/sales-product';

vi.mock('@/lib/registration-target-api', () => ({
  registrationTargetKeys: { list: (id: string) => ['registration-targets', 'list', id] },
  registrationTargetApi: { list: vi.fn(), resolve: vi.fn() },
}));
vi.mock('../lib/mall-price-execution', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/mall-price-execution')>(),
  executeTargetMallPrice: vi.fn(),
}));

const product = {
  id: 'product', options: [{ id: 'option', values: [], salePrice: 2000 }], channelOverrides: [],
  channelListings: [{
    id: 'listing', channelAccountId: 'account', mallKey: 'kakao', mallName: '카카오',
    externalId: 'mall-code', displayName: '몰 상품', status: '판매중',
    options: [{ id: 'mall-option', salesProductOptionId: 'option', salePrice: 1000 }],
  }],
} as unknown as SalesProduct;
const target = {
  id: 'target', salesProductId: 'product', channelAccountId: 'account', version: 3,
  displayName: '카카오 소매', registrationInput: {}, selectedOptions: [],
  resolved: { name: '상품', options: [{ salesProductOptionId: 'option', salePrice: 3000 }] },
} as unknown as RegistrationTarget;
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ChannelListingsSection product={product} />
  </QueryClientProvider>);
}

describe('ChannelListingsSection price execution', () => {
  beforeEach(() => vi.clearAllMocks());
  it('reuses a unique target without asking the operator to select it', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(executeTargetMallPrice).mockReturnValue(new Promise(() => {}));
    mount();
    await screen.findByText('카카오 소매');
    expect(screen.queryByRole('combobox', { name: 'mall-code 등록 설정' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '가격 보내기' }));
    const submit = screen.getByRole('button', { name: '3,000원 보내기' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(executeTargetMallPrice).toHaveBeenCalledTimes(1));
    // 상품 × 몰 계정당 등록 설정은 하나뿐이다(KID-310) — resolve 가 고를 것 없이 그 하나를 연다.
    expect(executeTargetMallPrice).toHaveBeenCalledWith(expect.objectContaining({
      salesProductId: 'product', channelAccountId: 'account',
      expectedPrice: 3000, listingId: 'listing', mallKey: 'kakao', idempotencyKey: expect.any(String),
    }));
    expect(vi.mocked(executeTargetMallPrice).mock.calls[0]![0]).not.toHaveProperty('targetId');
  });
  it('allocates a fresh intent after reload of a completed send', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(executeTargetMallPrice).mockResolvedValue({
      execution: { status: 'succeeded' },
      decision: { confirmed: true, message: '확인 완료', outcome: 'confirmed', after: 3000 }, sent: true,
    } as Awaited<ReturnType<typeof executeTargetMallPrice>>);
    const mounted = mount();
    await screen.findByText('카카오 소매');
    fireEvent.click(screen.getByRole('button', { name: '가격 보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '3,000원 보내기' }));
    await screen.findByText('확인 완료');
    mounted.unmount();
    mount();
    await screen.findByText('카카오 소매');
    fireEvent.click(screen.getByRole('button', { name: '가격 보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '3,000원 보내기' }));
    await waitFor(() => expect(executeTargetMallPrice).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(executeTargetMallPrice).mock.calls;
    expect(calls[1]![0].idempotencyKey).not.toBe(calls[0]![0].idempotencyKey);
  });
  it('uses the common product price and resolves a default target only when the operator confirms', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([]);
    vi.mocked(executeTargetMallPrice).mockReturnValue(new Promise(() => {}));
    mount();
    await screen.findByText('공통 판매가 2,000원');
    fireEvent.click(screen.getByRole('button', { name: '가격 보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '2,000원 보내기' }));
    await waitFor(() => expect(executeTargetMallPrice).toHaveBeenCalledWith(expect.objectContaining({
      salesProductId: 'product', channelAccountId: 'account', expectedPrice: 2000,
    })));
    expect(vi.mocked(executeTargetMallPrice).mock.calls[0]![0]).not.toHaveProperty('targetId');
  });
  // KID-310: 등록 설정은 상품 × 몰 계정당 하나뿐이다 — 고르는 화면이 없다.
  it('never renders a registration-target picker for this listing', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(executeTargetMallPrice).mockReturnValue(new Promise(() => {}));
    mount();
    await screen.findByText('카카오 소매');
    expect(screen.queryByRole('combobox', { name: 'mall-code 등록 설정' })).toBeNull();
  });
  it('does not offer another account’s target and keeps common values available', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([{ ...target, channelAccountId: 'other' }]);
    mount();
    await screen.findByText('공통 판매가 2,000원');
    expect(screen.getByRole('button', { name: '가격 보내기' })).toBeInTheDocument();
    expect(executeTargetMallPrice).not.toHaveBeenCalled();
  });
});
