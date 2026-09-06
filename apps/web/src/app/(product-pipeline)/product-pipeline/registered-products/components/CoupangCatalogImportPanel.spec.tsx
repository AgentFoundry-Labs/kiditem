import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CoupangCatalogImportPanel } from './CoupangCatalogImportPanel';

const ATTEMPT_ID = '06d1a75b-cbe6-4510-9e8a-2926a2aac321';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ACCOUNT = '00000000-0000-4000-8000-000000000002';
const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(), useCatalogImport: vi.fn(),
  start: vi.fn(), cancel: vi.fn(), openAttention: vi.fn(),
  toastSuccess: vi.fn(), toastError: vi.fn(), toastInfo: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: mocks.toastInfo },
}));
vi.mock('../hooks/useCoupangCatalogImport', () => ({ useCoupangCatalogImport: mocks.useCatalogImport }));
vi.mock('../lib/channel-listings-api', () => ({ channelListingsApi: { listAccounts: mocks.listAccounts } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CoupangCatalogImportPanel /></QueryClientProvider>);
}
function current() { return mocks.useCatalogImport.getMockImplementation()!(); }

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
  mocks.listAccounts.mockResolvedValue([
    { id: ACCOUNT_ID, channel: 'coupang', name: 'Coupang Wing', isPrimary: true },
  ]);
  mocks.start.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.openAttention.mockResolvedValue(undefined);
  mocks.useCatalogImport.mockReturnValue({
    activeAttempt: { channelAccountId: ACCOUNT_ID, attemptId: ATTEMPT_ID },
    serverStatus: {
      attemptId: ATTEMPT_ID, state: 'RUNNING', phase: 'hydration',
      manifest: { totalItems: 1_228 },
      progress: { discoveredProducts: 1_228, hydratedProducts: 400,
        publishedProducts: 0, publishedOptionCount: 0, publishedMediaCount: 0 },
      createdAt: '2026-07-15T00:00:00.000Z', error: null, publication: null,
    },
    extensionStatus: { attemptId: ATTEMPT_ID, active: true, attention: null },
    isStarting: false, isStopping: false, startError: null, readError: null,
    start: mocks.start, cancel: mocks.cancel, openAttention: mocks.openAttention,
  });
});

it('keeps compact staged progress and an owner cancel button beside collection activity', async () => {
  setup();
  expect(await screen.findByRole('button', { name: '수집 중' })).toBeDisabled();
  expect(screen.getByText('상세 수집 400 / 1,228')).toBeInTheDocument();
  expect(screen.getByText('전체 수집 후 한 번에 반영')).toBeInTheDocument();
  expect(screen.getByText('수집 중에는 기존 상품 데이터 유지')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '수집 재개' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '수집 중단' }));
  await waitFor(() => expect(mocks.cancel).toHaveBeenCalledTimes(1));
  expect(mocks.toastSuccess).not.toHaveBeenCalled();
});

it('honors the exact linked account instead of a different primary account without auto-starting', async () => {
  window.history.replaceState(null, '', `/?collectionAttempt=${ATTEMPT_ID}&channelAccountId=${OTHER_ACCOUNT}`);
  mocks.listAccounts.mockResolvedValue([
    { id: ACCOUNT_ID, channel: 'coupang', name: 'Primary', isPrimary: true },
    { id: OTHER_ACCOUNT, channel: 'coupang', name: 'Linked' },
  ]);
  setup();
  expect(mocks.useCatalogImport.mock.calls[0]).toEqual([OTHER_ACCOUNT, ATTEMPT_ID]);
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue(OTHER_ACCOUNT));
  expect(mocks.start).not.toHaveBeenCalled();
});

it.each([
  `?collectionAttempt=invalid&channelAccountId=${ACCOUNT_ID}`,
  `?collectionAttempt=${ATTEMPT_ID}&channelAccountId=invalid`,
  `?collectionAttempt=${ATTEMPT_ID}`,
  `?collectionRun=${ATTEMPT_ID}&channelAccountId=${ACCOUNT_ID}`,
])('does not use invalid or retired deep-link correlation: %s', async (query) => {
  window.history.replaceState(null, '', '/' + query);
  setup();
  await waitFor(() => expect(mocks.useCatalogImport).toHaveBeenLastCalledWith(ACCOUNT_ID, null));
  expect(mocks.start).not.toHaveBeenCalled();
});

it('uses COMPLETE alone for success and repeats neither toast nor collecting controls for stale local activity', async () => {
  mocks.useCatalogImport.mockReturnValue({
    ...current(), serverStatus: { ...current().serverStatus, state: 'COMPLETE', phase: 'finished' },
    startError: new Error('lost start ACK'),
    extensionStatus: { attemptId: ATTEMPT_ID, active: true, attention: null, error: 'stale browser error' },
  });
  const view = setup();
  await waitFor(() => expect(screen.getByRole('button', { name: '다시 동기화' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: '수집 중' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '수집 중단' })).not.toBeInTheDocument();
  expect(screen.queryByText('lost start ACK')).not.toBeInTheDocument();
  expect(screen.queryByText('stale browser error')).not.toBeInTheDocument();
  expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  view.rerender(<QueryClientProvider client={new QueryClient()}><CoupangCatalogImportPanel /></QueryClientProvider>);
  expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
});

it('shows FAILED owner error over stale browser activity and keeps attention explicitly clickable', async () => {
  mocks.useCatalogImport.mockReturnValue({
    ...current(), serverStatus: { ...current().serverStatus, state: 'FAILED', error: { message: 'owner expired' } },
    extensionStatus: { attemptId: ATTEMPT_ID, active: true,
      attention: { reason: 'login_required', message: 'Wing 로그인 확인', canOpenTab: true } },
  });
  setup();
  expect(screen.getByText('owner expired')).toBeInTheDocument();
  expect(screen.getByText('Wing 로그인 확인')).toBeInTheDocument();
  expect(mocks.openAttention).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '확인 탭 열기' }));
  await waitFor(() => expect(mocks.openAttention).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button', { name: '수집 중' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '수집 재개' })).not.toBeInTheDocument();
  expect(mocks.toastSuccess).not.toHaveBeenCalled();
});

it('allows owner cancellation and explicit resume when the extension is unavailable', async () => {
  mocks.useCatalogImport.mockReturnValue({ ...current(), extensionStatus: null });
  setup();
  expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
  fireEvent.click(await screen.findByRole('button', { name: '수집 재개' }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
  expect(mocks.toastSuccess).not.toHaveBeenCalled();
});

it('surfaces uncertain cancellation without a browser-ACK success claim', async () => {
  mocks.cancel.mockRejectedValue(new Error('owner status unknown'));
  setup();
  fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));
  await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('owner status unknown'));
  expect(mocks.toastSuccess).not.toHaveBeenCalled();
});
