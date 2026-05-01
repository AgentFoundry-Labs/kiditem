import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActionBoardPage from '../page';
import type { ActionTask } from '@kiditem/shared/action-task';

// ── next/navigation mock ──────────────────────────────────────────────────────
const mockPush = vi.fn();
let mockSearchParamsGet = vi.fn().mockReturnValue(null);

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: mockSearchParamsGet,
    toString: vi.fn().mockReturnValue(''),
  }),
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/action-board',
}));

// ── apiClient mock ─────────────────────────────────────────────────────────────
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

// ── sonner toast mock ─────────────────────────────────────────────────────────
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ── isApiError mock ────────────────────────────────────────────────────────────
vi.mock('@/lib/api-error', () => ({
  isApiError: (err: unknown): err is { status: number; detail: string } =>
    typeof err === 'object' && err !== null && 'status' in err,
}));

import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

const MY_USER_ID = 'user-mine-0001-0000-000000000001';
const OTHER_USER_ID = 'user-other-0002-0000-000000000002';

function makeTask(overrides: Partial<ActionTask> = {}): ActionTask {
  return {
    id: 'task-1',
    organizationId: 'organization-1',
    taskKey: 'ad.check.roas',
    type: 'human',
    label: '광고 ROAS 점검',
    detail: '점검 필요',
    where: '광고 페이지',
    href: null,
    priority: 'medium',
    status: 'pending',
    role: 'ad',
    apiCall: null,
    result: null,
    notes: [],
    activityLog: [],
    date: '2026-04-15',
    relatedProducts: [],
    assigneeUserId: null,
    assigneeUser: null,
    sourceAlert: null,
    createdAt: '2026-04-15T00:00:00Z',
    updatedAt: '2026-04-15T00:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ActionBoardPage />
    </QueryClientProvider>,
  );
}

describe('ActionBoardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsGet = vi.fn().mockReturnValue(null);
    vi.unstubAllEnvs();
    vi.mocked(apiClient.get).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── 1. Scope URL param ────────────────────────────────────────────────────

  it('scope=me URL param → query called with assignedTo=me', async () => {
    mockSearchParamsGet = vi.fn().mockReturnValue('me');
    vi.mocked(apiClient.get).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/action-tasks?assignedTo=me');
    });
  });

  it('scope=all (default) → query called without assignedTo param', async () => {
    mockSearchParamsGet = vi.fn().mockReturnValue(null);
    vi.mocked(apiClient.get).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/action-tasks');
    });
  });

  // ── 2. SegmentedControl scope click → URL update ──────────────────────────

  it.each([
    ['내 것', null, '/action-board?scope=me'],
    ['전체', 'me', '/action-board'],
  ])('탭 "%s" 클릭 → router.push(%s)', async (tabName, initialScope, expectedUrl) => {
    mockSearchParamsGet = vi.fn().mockReturnValue(initialScope);
    vi.mocked(apiClient.get).mockResolvedValue([]);
    renderPage();
    await waitFor(() => screen.getByRole('tablist', { name: '담당자 필터' }));
    fireEvent.click(screen.getByRole('tab', { name: tabName }));
    expect(mockPush).toHaveBeenCalledWith(expectedUrl);
  });

  // ── 3. Card shows assigneeUser.name ───────────────────────────────────────

  it('카드에 assigneeUser.name 표시', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTask({ assigneeUserId: OTHER_USER_ID, assigneeUser: { id: OTHER_USER_ID, name: 'Alice' } }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(0));
  });

  it('assigneeUserId null → "(미담당)" 텍스트 표시', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([makeTask({ assigneeUserId: null, assigneeUser: null })]);
    renderPage();
    await waitFor(() => expect(screen.getAllByText('(미담당)').length).toBeGreaterThan(0));
  });

  // ── 4. assigneeUserId null → "내가 맡기" 버튼 렌더 ────────────────────────

  it('assigneeUserId null → "내가 맡기" 버튼 존재', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([makeTask({ assigneeUserId: null })]);
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('button', { name: '내가 맡기' }).length).toBeGreaterThan(0));
  });

  // ── 5. isMine → "해제" 버튼 렌더 ─────────────────────────────────────────

  it('isMine → "해제" 버튼 존재', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_USER_ID', MY_USER_ID);
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTask({ assigneeUserId: MY_USER_ID, assigneeUser: { id: MY_USER_ID, name: '나' } }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('button', { name: '해제' }).length).toBeGreaterThan(0));
  });

  // ── 6. 타인 담당 → 버튼 없음, 이름 텍스트만 ──────────────────────────────

  it('타인 담당 → "내가 맡기"/"해제" 버튼 없음', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_USER_ID', MY_USER_ID);
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTask({ assigneeUserId: OTHER_USER_ID, assigneeUser: { id: OTHER_USER_ID, name: 'Bob' } }),
    ]);
    renderPage();
    // wait for page to render (task label visible)
    await screen.findByText('광고 ROAS 점검');
    expect(screen.queryByRole('button', { name: '내가 맡기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '해제' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Bob님 담당').length).toBeGreaterThan(0);
  });

  // ── 7. sourceAlert → "← from alert" 뱃지 렌더 ───────────────────────────

  it('sourceAlert 있을 때 "← from alert" 뱃지 렌더 (severity 포함)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTask({
        sourceAlert: { id: 'alert-1', title: 'ROAS 급락 경보', severity: 'error', message: null },
      }),
    ]);
    renderPage();
    await waitFor(() => {
      const badges = screen.getAllByText(/← ROAS 급락 경보/);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('sourceAlert severity=warning → amber 색상 클래스 포함', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTask({
        sourceAlert: { id: 'alert-2', title: '재고 경고 발생 테스트', severity: 'warning', message: null },
      }),
    ]);
    renderPage();
    await waitFor(() => {
      const badge = screen.getAllByText(/← 재고 경고 발생 테스트/)[0];
      expect(badge.className).toContain('bg-amber-100');
    });
  });

  // ── 8. claim mutation onSuccess → invalidate + toast ─────────────────────

  it('claim mutation onSuccess → toast.success("맡았습니다")', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_USER_ID', MY_USER_ID);
    vi.mocked(apiClient.get).mockResolvedValue([makeTask({ id: 'task-claim-1', assigneeUserId: null })]);
    vi.mocked(apiClient.patch).mockResolvedValue(makeTask({ assigneeUserId: MY_USER_ID }));

    renderPage();
    const claimBtn = await screen.findAllByRole('button', { name: '내가 맡기' });
    fireEvent.click(claimBtn[0]);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(expect.stringContaining('/claim'), {});
      expect(toast.success).toHaveBeenCalledWith('맡았습니다');
    });
  });

  // ── 9. claim 409 → toast.error("이미 다른 사람이...") ────────────────────

  it('claim 409 → toast.error("이미 다른 사람이 맡았습니다")', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_USER_ID', MY_USER_ID);
    vi.mocked(apiClient.get).mockResolvedValue([makeTask({ id: 'task-409', assigneeUserId: null })]);
    vi.mocked(apiClient.patch).mockRejectedValue({ status: 409, detail: '이미 담당자가 있습니다' });

    renderPage();
    const claimBtn = await screen.findAllByRole('button', { name: '내가 맡기' });
    fireEvent.click(claimBtn[0]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('이미 다른 사람이 맡았습니다');
    });
  });
});
