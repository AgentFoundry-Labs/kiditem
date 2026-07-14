import type { PropsWithChildren } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ChannelSkuComponentDialog } from '../ChannelSkuComponentDialog';
import type {
  ChannelSkuMappingListItem,
  ChannelSkuMatchCandidateListResponse,
} from '@kiditem/shared/channel-sku-matching';

const listCandidates = vi.hoisted(() => vi.fn());

vi.mock('../../lib/channel-sku-matching-api', async () => {
  const actual = await vi.importActual<
    typeof import('../../lib/channel-sku-matching-api')
  >('../../lib/channel-sku-matching-api');
  return { ...actual, listChannelSkuCandidates: listCandidates };
});

const CHANNEL_SKU_ID = '11111111-1111-4111-8111-111111111111';

const target: ChannelSkuMappingListItem = {
  channelAccount: {
    id: '22222222-2222-4222-8222-222222222222',
    channel: 'coupang',
    name: '쿠팡 Wing',
  },
  product: {
    id: '33333333-3333-4333-8333-333333333333',
    externalProductId: 'product-1',
    registeredName: '등록 상품',
    displayName: null,
    status: '판매중',
  },
  sku: {
    id: CHANNEL_SKU_ID,
    externalSkuId: 'sku-1',
    sellerSku: null,
    optionName: '분홍',
    barcode: null,
    modelNumber: null,
    salePrice: null,
    status: '판매중',
    mappingStatus: 'matched',
    sellableStock: 2,
    updatedAt: '2026-07-12T00:00:00.000Z',
  },
  components: [
    {
      masterProductId: '44444444-4444-4444-8444-444444444444',
      code: 'SP-SAVED',
      name: '저장된 구성품',
      optionName: null,
      barcode: null,
      currentStock: 4,
      purchasePrice: 1000,
      quantity: 2,
      mappingSource: 'manual',
      componentCapacity: 2,
      isBottleneck: true,
    },
  ],
};

function candidateResponse(
  masterProductId: string,
  code: string,
): ChannelSkuMatchCandidateListResponse {
  return {
    items: [
      {
        masterProductId,
        code,
        name: `${code} 후보`,
        optionName: null,
        barcode: null,
        currentStock: 3,
        reason: 'manual_search',
        rank: 0,
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('ChannelSkuComponentDialog candidate refetch', () => {
  it('hides cached candidate actions during remount refetch while preserving saved draft rows', async () => {
    const secondFetch = deferred<ChannelSkuMatchCandidateListResponse>();
    listCandidates
      .mockReset()
      .mockResolvedValueOnce(
        candidateResponse(
          '55555555-5555-4555-8555-555555555555',
          'SP-OLD',
        ),
      )
      .mockReturnValueOnce(secondFetch.promise);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const first = render(
      <ChannelSkuComponentDialog
        open
        item={target}
        onOpenChange={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(
      await screen.findByRole('button', { name: 'SP-OLD 구성에 추가' }),
    ).toBeInTheDocument();
    first.unmount();

    render(
      <ChannelSkuComponentDialog
        open
        item={target}
        onOpenChange={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(listCandidates).toHaveBeenCalledTimes(2));

    expect(
      screen.queryByRole('button', { name: 'SP-OLD 구성에 추가' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Sellpia 후보를 최신 상태로 다시 확인 중입니다.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('SP-SAVED 수량')).toHaveValue('2');

    await act(async () => {
      secondFetch.resolve(
        candidateResponse(
          '66666666-6666-4666-8666-666666666666',
          'SP-NEW',
        ),
      );
      await secondFetch.promise;
    });

    expect(
      await screen.findByRole('button', { name: 'SP-NEW 구성에 추가' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'SP-OLD 구성에 추가' }),
    ).not.toBeInTheDocument();
  });
});
