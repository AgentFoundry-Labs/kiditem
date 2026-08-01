import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CoupangShipmentsPage from './page';
import {
  loadCoupangShipmentDateSummary,
  loadCoupangShipmentServerFiles,
} from './lib/coupang-shipment-api';
import { loadCoupangShipmentFiles } from './lib/coupang-shipment-store';
import { operationsApi } from '@/lib/operations-api';

const replaceMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({
  pathname: '/coupang-shipments',
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => navigation.params,
}));

vi.mock('@/hooks/useOperationRun', () => ({
  isTerminalOperationStatus: vi.fn(() => false),
  useOperationRun: vi.fn(() => ({ data: undefined })),
}));

vi.mock('@/lib/operations-api', () => ({
  operationsApi: { start: vi.fn() },
}));

vi.mock('./lib/coupang-shipment-api', () => ({
  downloadCoupangShipmentServerFile: vi.fn(),
  loadCoupangShipmentDateSummary: vi.fn(),
  loadCoupangShipmentServerFiles: vi.fn(),
  saveCoupangShipmentDateSummary: vi.fn(),
}));

vi.mock('./lib/coupang-shipment-store', () => ({
  deleteCoupangShipmentFile: vi.fn(),
  loadCoupangShipmentFiles: vi.fn(),
  saveCoupangShipmentFiles: vi.fn(),
}));

vi.mock('./lib/coupang-shipment-extension', () => ({
  COUPANG_SHIPMENT_RESPONSE_INVALID_CODE: 'response_invalid',
  clearCoupangCookiesViaExtension: vi.fn(),
  collectCoupangShipmentDateSummaryViaExtension: vi.fn(),
  collectCoupangShipmentDraftsViaExtension: vi.fn(),
  isCoupangCookieBloatError: vi.fn(() => false),
  isCoupangShipmentSessionRequiredError: vi.fn(() => false),
  openCoupangShipmentPageViaExtension: vi.fn(),
}));

describe('<CoupangShipmentsPage /> calendar view persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    navigation.params = new URLSearchParams();
    replaceMock.mockReset();
    vi.mocked(operationsApi.start).mockReset();
    vi.mocked(loadCoupangShipmentFiles).mockResolvedValue([]);
    vi.mocked(loadCoupangShipmentServerFiles).mockResolvedValue({ days: [] });
    vi.mocked(loadCoupangShipmentDateSummary).mockResolvedValue({
      items: [
        { date: '2026-07-25', count: 3, boxes: 5, capturedAt: '2026-07-25T00:00:00.000Z' },
        { date: '2026-06-20', count: 2, boxes: 2, capturedAt: '2026-06-20T00:00:00.000Z' },
      ],
    });
  });

  it('restores the viewed month and selected shipment date from the URL', async () => {
    navigation.params = new URLSearchParams({
      month: '2026-06',
      date: '2026-06-20',
    });

    render(<CoupangShipmentsPage />);

    expect(await screen.findByText('2026년 6월')).toBeInTheDocument();
    expect(screen.getByText('2026-06-20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /20/ })).toHaveClass('bg-purple-50');
  });

  it('restores the last route state from session storage when returning through the bare URL', async () => {
    sessionStorage.setItem('kiditem:route-state:coupang-shipments:v1', JSON.stringify({
      month: '2026-06',
      date: '2026-06-20',
    }));

    render(<CoupangShipmentsPage />);

    await waitFor(() => {
      expect(replaceMock.mock.calls.some(([href]) =>
        typeof href === 'string'
        && href.startsWith('/coupang-shipments?')
        && href.includes('month=2026-06')
        && href.includes('date=2026-06-20'))).toBe(true);
    });
  });

  it('starts the same shipment-summary operation as the dashboard action', async () => {
    vi.mocked(operationsApi.start).mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
    } as never);
    render(<CoupangShipmentsPage />);

    fireEvent.click(await screen.findByRole('button', { name: '다시 조회' }));

    await waitFor(() => {
      expect(operationsApi.start).toHaveBeenCalledWith(
        'inventory.collect_coupang_shipment_summary',
        expect.objectContaining({
          sourceSurface: 'domain_screen',
          input: {},
          idempotencyKey: expect.stringMatching(/^coupang-shipments:summary:/),
        }),
      );
    });
  });
});
