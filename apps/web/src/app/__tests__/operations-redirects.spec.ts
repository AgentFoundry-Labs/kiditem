import { beforeEach, describe, expect, it, vi } from 'vitest';
import InventoryHubPage from '../(inventory)/inventory-hub/page';
import InventoryPage from '../(inventory)/inventory/page';
import OutboundPage from '../(inventory)/outbound/page';
import StockOpsPage from '../(inventory)/stock-ops/page';
import UnshippedItemsPage from '../(inventory)/unshipped-items/page';
import ProductHubOptionsPage from '../(catalog)/product-hub/options/page';
import OrderCollectionPage from '../(orders)/order-collection/page';
import OrderHubPage from '../(orders)/order-hub/page';
import OrderStatusHubPage from '../(orders)/order-status-hub/page';
import OrdersPage from '../(orders)/orders/page';
import RocketOrdersPage from '../(orders)/rocket-orders/page';

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    redirect: mockRedirect,
  };
});

type SearchParams = Record<string, string | string[] | undefined>;
type RedirectPage = (props: { searchParams: Promise<SearchParams> }) => unknown;

async function expectRedirect(
  page: RedirectPage,
  searchParams: SearchParams,
  destination: string,
) {
  mockRedirect.mockImplementationOnce((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  });

  await expect(page({ searchParams: Promise.resolve(searchParams) }))
    .rejects.toThrow(`NEXT_REDIRECT:${destination}`);
  expect(mockRedirect).toHaveBeenLastCalledWith(destination);
}

describe('legacy operations pages', () => {
  beforeEach(() => {
    mockRedirect.mockReset();
  });

  it.each([
    [InventoryPage, { search: 'hat' }, '/inventory-hub?tab=inventory&search=hat'],
    [StockOpsPage, { tab: 'return-transfer', status: ['a', 'b'] }, '/inventory-hub?tab=history&view=return&status=a&status=b'],
    [OrderCollectionPage, { from: '2026-07-01', to: '2026-07-31' }, '/order-hub?tab=collection&from=2026-07-01&to=2026-07-31'],
    [OrdersPage, { orderId: 'order-1' }, '/order-hub?tab=processing&orderId=order-1'],
    [UnshippedItemsPage, { search: 'recipient' }, '/order-hub?tab=exceptions&view=unshipped&search=recipient'],
    [OutboundPage, { status: 'ready' }, '/order-hub?tab=shipping&status=ready'],
    [OrderStatusHubPage, { tab: 'delivery', search: 'invoice' }, '/order-hub?tab=shipping&view=delivery-search&search=invoice'],
    [RocketOrdersPage, { supplierId: 'supplier-1' }, '/purchase-orders?tab=rocket&supplierId=supplier-1'],
    [ProductHubOptionsPage, { search: '보넷' }, '/product-hub?view=options&search=%EB%B3%B4%EB%84%B7'],
  ] as const)('redirects a real legacy page to its query-aware canonical location', async (page, params, destination) => {
    await expectRedirect(page as RedirectPage, params, destination);
  });
});

describe('canonical workspace wrappers', () => {
  beforeEach(() => {
    mockRedirect.mockReset();
  });

  it.each([
    [InventoryHubPage, { tab: 'po', supplierId: 'supplier-1' }, '/purchase-orders?tab=general&supplierId=supplier-1'],
    [OrderHubPage, { tab: 'picking', orderId: 'order-1' }, '/order-hub?tab=processing&view=picking&orderId=order-1'],
  ] as const)('redirects only recognized aliases through the real wrapper page', async (page, params, destination) => {
    await expectRedirect(page as RedirectPage, params, destination);
  });

  it.each([
    [InventoryHubPage, { tab: 'overview', search: 'hat' }],
    [OrderHubPage, { tab: 'processing', orderId: 'order-1' }],
  ] as const)('does not loop for canonical wrapper state', async (page, params) => {
    await (page as RedirectPage)({ searchParams: Promise.resolve(params) });
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
