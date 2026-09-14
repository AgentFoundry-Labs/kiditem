import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertItem } from '@kiditem/shared/alerts';
import MallHomePage from './page';

/** 전역 알림 쿼리(`/api/alerts`) — 쇼핑몰 홈은 여기서 몰 일만 골라 읽는다. */
const alertsQuery = vi.hoisted(() => ({
  data: [] as AlertItem[] | undefined,
  isSuccess: true,
  isError: false,
}));
const mockDismissAlert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/alerts-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/alerts-api')>()),
  useAlertsQuery: () => alertsQuery,
  useDismissAlert: () => ({ mutate: mockDismissAlert, isPending: false }),
}));

const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiClient: { ...actual.apiClient, post: mockApiPost } };
});

const mockDetectProbe = vi.hoisted(() => vi.fn());
const mockProbeMall = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mall-session-probe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mall-session-probe')>()),
  detectMallSessionProbe: mockDetectProbe,
  probeMallSession: mockProbeMall,
}));

const queryClientStub = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));

/**
 * 쇼핑몰 홈이 지키는 것.
 *
 *  1. 대시보드 3 : 쇼핑몰 알림판 1. 알림판은 몰 알림만 모으고, 위 칸과 몰 타일로 걸러진다.
 *  2. 지금 상태 알림은 받은 숫자로만 선다. 모르면 세우지 않는다.
 *  3. 미션마다 지금 실제로 되는 것과 다음 할 일을 적는다. 숫자는 쇼핑몰 현황과 같은 판정이다.
 */

let overview: unknown;
let manifests: unknown;
let availability: unknown;
let coupangSummary: unknown;
let outcomes: unknown;

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => queryClientStub,
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey.includes('manifests')
      ? manifests
      : queryKey.includes('availability-preview')
        ? availability
        : queryKey.includes('coupangDashboard')
          ? coupangSummary
          : queryKey.includes('mallOperationOutcomes')
            ? outcomes
            : overview,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

// 실제 next/link 는 aria-label · title 을 그대로 넘긴다. 아이콘만 있는 링크의 이름이
// 라벨에서 나오므로, 목도 나머지 속성을 그대로 넘겨야 화면과 같은 접근성 이름이 나온다.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
    ...rest
  }: { children: React.ReactNode; href: string; className?: string } & Record<string, unknown>) => (
    <a href={href} className={className} {...rest}>{children}</a>
  ),
}));

const channel = (mallKey: string, mallName: string, overrides: Record<string, unknown> = {}) => ({
  mallKey,
  mallName,
  channelAccountId: 'acc',
  canPublish: false,
  hasCredentials: true,
  imported: false,
  collectsOrders: false,
  uploadsTracking: false,
  listingCount: 0,
  orderCount: 0,
  productCount: 0,
  readiness: 'unsupported',
  ...overrides,
});

const alertItem = (id: string, overrides: Partial<AlertItem> = {}): AlertItem => ({
  id,
  attemptId: null,
  status: 'OPEN',
  type: 'source_failure',
  title: '몰 주문수집 실패',
  message: null,
  targetType: null,
  targetId: null,
  sourceType: 'order_collection_mall',
  href: '/order-collection',
  isRead: false,
  createdAt: '2026-09-11T01:00:00.000Z',
  updatedAt: '2026-09-11T01:00:00.000Z',
  ...overrides,
});

/** 몰 주문수집 원천 — 몰마다 달라서 알림이 몰을 말하지 않는다. */
const orderCollectionFailed = alertItem('11111111-1111-4111-8111-111111111111', {
  message: '온채널 파일 생성 실패',
});
/** 쿠팡 로켓 원천 — 원천 자체가 로켓 몰 것이다. 다시 성공해서 닫혔다. */
const rocketResolved = alertItem('33333333-3333-4333-8333-333333333333', {
  sourceType: 'coupang_rocket_po_catalog',
  title: '로켓 PO 수집',
  status: 'RESOLVED',
  message: 'PO 목록을 다시 받았습니다',
  isRead: true,
  href: '/rocket-orders',
  updatedAt: '2026-09-11T02:00:00.000Z',
});

function seedAlerts(...items: AlertItem[]) {
  alertsQuery.data = items;
}

beforeEach(() => {
  manifests = [
    { key: 'onch', applicable: true, unverified: false, supports: { soldOut: true }, hazards: { soldOutDeletesListing: false } },
    { key: 'rocket', applicable: false, unverified: false, supports: { soldOut: false }, hazards: { soldOutDeletesListing: false } },
  ];
  overview = {
    shop: { productCount: 10, connectedChannelCount: 2, publishableChannelCount: 1 },
    channels: [
      channel('onch', '온채널', { collectsOrders: true, uploadsTracking: true }),
      channel('rocket', '쿠팡 로켓'),
    ],
  };
  availability = { candidates: [], total: 0, loaded: 0, sendableCount: 0, blockedCount: 0 };
  coupangSummary = { todayOrders: { count: 0, revenue: 0 }, pendingAccept: 0, pendingReturns: 0, lastModifiedAt: null };
  outcomes = undefined;
  alertsQuery.data = [];
  alertsQuery.isSuccess = true;
  alertsQuery.isError = false;
  mockDismissAlert.mockReset();
  // 기본은 확장 없음 — 로그인 상태 확인은 테스트마다 따로 켠다.
  mockDetectProbe.mockReset();
  mockDetectProbe.mockResolvedValue({ status: 'not_found' });
  mockProbeMall.mockReset();
  mockApiPost.mockReset();
  mockApiPost.mockResolvedValue({ ok: true });
  queryClientStub.invalidateQueries.mockClear();
  window.sessionStorage.clear();
});

function mission(title: RegExp): HTMLElement {
  return screen.getByRole('listitem', { name: title });
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '쇼핑몰 알림' });
}

function pipelineColumns(): HTMLElement[] {
  const pipeline = screen.getByRole('list', { name: '에이전트 파이프라인' });
  return within(pipeline).getAllByRole('listitem', { name: /^\d단계 / });
}

describe('쇼핑몰 홈 — 대시보드와 알림판', () => {
  it('⭐ 대시보드 3 : 알림판 1 — 알림판이 오른쪽 1/4 에 선다', () => {
    render(<MallHomePage />);
    const aside = panel();
    expect(aside.className).toContain('xl:col-span-1');
    expect(aside.parentElement?.className).toContain('xl:grid-cols-4');
    expect(aside.parentElement?.firstElementChild?.className).toContain('xl:col-span-3');
  });

  it('⭐ 알림판은 몰 알림만 모은다 — 광고 알림은 빠진다', () => {
    seedAlerts(
      orderCollectionFailed,
      alertItem('22222222-2222-4222-8222-222222222222', {
        sourceType: 'coupang_ad_campaign',
        title: '광고 캠페인 수집 실패',
        message: '광고 데이터를 받지 못했습니다',
      }),
    );
    render(<MallHomePage />);
    expect(within(panel()).getByText('온채널 파일 생성 실패')).toBeInTheDocument();
    expect(within(panel()).queryByText('광고 데이터를 받지 못했습니다')).not.toBeInTheDocument();
  });

  it('알림을 아직 못 받았으면 열린 몰 알림 칸은 0 이 아니라 — 다', () => {
    alertsQuery.data = undefined;
    alertsQuery.isSuccess = false;
    render(<MallHomePage />);
    expect(screen.getByRole('button', { name: /^열린 몰 알림/ })).toHaveTextContent('—');
    expect(within(panel()).getByText('몰 작업 알림을 불러오는 중')).toBeInTheDocument();
  });

  it('지금 상태 알림 — 로그인 정보 · 쿠팡 발주확인 · 품절 후보가 알림판에 선다', () => {
    overview = {
      shop: { productCount: 10, connectedChannelCount: 2, publishableChannelCount: 1 },
      channels: [channel('onch', '온채널', { hasCredentials: false }), channel('rocket', '쿠팡 로켓')],
    };
    availability = { candidates: [], total: 5, loaded: 0, sendableCount: 0, blockedCount: 0 };
    coupangSummary = { todayOrders: { count: 0, revenue: 0 }, pendingAccept: 3, pendingReturns: 0, lastModifiedAt: null };
    render(<MallHomePage />);
    const aside = panel();
    expect(within(aside).getByText('로그인 정보가 비어 있는 몰 1곳')).toBeInTheDocument();
    expect(within(aside).getByText('쿠팡 발주확인 대기 3건')).toBeInTheDocument();
    expect(within(aside).getByText('품절 후보 5개')).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: /계정 설정/ })).toHaveAttribute('href', '/mall-settings');
    // 문제 있는 몰 타일은 빨갛다.
    expect(screen.getByRole('button', { name: '온채널 로그인 정보 없음' }).className).toContain('bg-red-50');
    expect(screen.getByRole('button', { name: /^쿠팡 로켓 / }).className).not.toContain('bg-red-50');
  });

  it('⭐ 못 받은 숫자로 알림을 지어내지 않는다', () => {
    availability = undefined;
    coupangSummary = undefined;
    render(<MallHomePage />);
    expect(within(panel()).queryByText(/품절 후보 \d/)).not.toBeInTheDocument();
    expect(within(panel()).queryByText(/쿠팡 발주확인 대기/)).not.toBeInTheDocument();
  });

  it('확인 필요 칸을 누르면 알림판이 확인 필요만 보여 준다', () => {
    seedAlerts(orderCollectionFailed, rocketResolved);
    render(<MallHomePage />);
    expect(within(panel()).getByText('PO 목록을 다시 받았습니다')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^확인 필요.*알림판에서 보기$/ }));

    expect(within(panel()).getByRole('button', { name: /^확인 필요/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel()).queryByText('PO 목록을 다시 받았습니다')).not.toBeInTheDocument();
    expect(within(panel()).getByText('온채널 파일 생성 실패')).toBeInTheDocument();
  });

  /** 몰은 알림이 스스로 말할 때만 — 쿠팡 로켓 원천은 로켓 몰 것이고, 몰 주문수집 원천은 몰을 말하지 않는다. */
  it('⭐ 몰 타일을 누르면 그 몰 알림만 본다', () => {
    const rocketFailed = alertItem('44444444-4444-4444-8444-444444444444', {
      sourceType: 'coupang_rocket_po_catalog',
      title: '로켓 PO 수집',
      message: 'PO 목록을 받지 못했습니다',
    });
    seedAlerts(orderCollectionFailed, rocketFailed);
    render(<MallHomePage />);

    fireEvent.click(screen.getByRole('button', { name: '쿠팡 로켓 로켓 PO 수집 실패' }));
    expect(within(panel()).getByText('PO 목록을 받지 못했습니다')).toBeInTheDocument();
    expect(within(panel()).queryByText('온채널 파일 생성 실패')).not.toBeInTheDocument();

    fireEvent.click(within(panel()).getByRole('button', { name: /쿠팡 로켓 알림만 보는 중/ }));
    expect(within(panel()).getByText('온채널 파일 생성 실패')).toBeInTheDocument();
  });

  /** 닫기는 전역 알림판과 같은 규칙이다 — 열린 알림만 닫고, 닫힌(다시 성공한) 알림에는 버튼이 없다. */
  it('⭐ 열린 몰 알림은 알림판에서 닫는다 — 해결된 알림은 닫을 것이 없다', () => {
    seedAlerts(orderCollectionFailed, rocketResolved);
    render(<MallHomePage />);

    expect(screen.getByRole('button', { name: /^열린 몰 알림/ })).toHaveTextContent('1건');
    expect(within(panel()).queryByRole('button', { name: '로켓 PO 수집 알림 닫기' })).not.toBeInTheDocument();

    fireEvent.click(within(panel()).getByRole('button', { name: '몰 주문수집 실패 알림 닫기' }));
    expect(mockDismissAlert).toHaveBeenCalledWith(orderCollectionFailed.id, expect.anything());
  });
});

describe('쇼핑몰 홈 — 에이전트 파이프라인', () => {
  it('⭐ 미션 자리에 선다 — 단계마다 아래로 그 단계의 일', () => {
    render(<MallHomePage />);
    const columns = pipelineColumns();
    expect(columns.map((column) => column.getAttribute('aria-label'))).toEqual([
      '1단계 미션',
      '2단계 감지',
      '3단계 판단',
      '4단계 도구',
      '5단계 사람 승인',
      '6단계 기억',
    ]);
    expect(within(columns[0]!).getAllByRole('listitem', { name: /^미션 / })).toHaveLength(10);
    expect(within(columns[2]!).getByText('지금은 사람이 알림판을 보고 고른다.')).toBeInTheDocument();
    expect(within(columns[5]!).getByText('사람이 고른 몰 등록 값')).toBeInTheDocument();
    expect(screen.getByText(/판단이 아직이라 이 고리는 열려 있다/)).toBeInTheDocument();
  });

  /** 색은 칸 머리에만 둔다 — 칸 몸통과 줄은 흰색이고, 상태는 칩이 말한다. */
  it('⭐ 화살표 없이 칸 머리 색으로만 단계를 가른다', () => {
    render(<MallHomePage />);
    const pipeline = screen.getByRole('list', { name: '에이전트 파이프라인' });
    const columns = pipelineColumns();
    expect(pipeline.querySelector('.lucide-chevron-right')).toBeNull();
    expect(columns.map((column) => column.dataset.stage)).toEqual([
      'mission',
      'sense',
      'decide',
      'act',
      'approve',
      'remember',
    ]);
    const names = columns.map((column) => column.querySelector('[data-stage-name]')?.getAttribute('style'));
    expect(new Set(names).size).toBe(6);
    // 칸 몸통에는 파스텔 배경 클래스를 두지 않는다.
    for (const column of columns) {
      expect(/(?:^|\s)bg-[a-z]+-\d+/.test(column.className)).toBe(false);
    }
  });

  /** 여섯 칸이 한 화면에 다 들어와야 한다 — 가로 스크롤을 붙이지 않는다. */
  it('⭐ 칸은 같은 너비 · 같은 높이, 가로 스크롤은 없다', () => {
    render(<MallHomePage />);
    const pipeline = screen.getByRole('list', { name: '에이전트 파이프라인' });
    expect(pipeline.className).toContain('grid-cols-6');
    expect(pipeline.className).not.toContain('overflow-x');
    for (const column of pipelineColumns()) {
      expect(column.className).toContain('h-full');
    }
    // 줄은 어느 칸이든 같은 모양 — 제목 한 줄, 설명 두 줄 고정, 오른쪽 자리 하나.
    for (const column of pipelineColumns()) {
      for (const row of within(column).getAllByRole('listitem')) {
        expect(row.querySelector('.truncate')).not.toBeNull();
        expect(row.querySelector('.line-clamp-2.h-8')).not.toBeNull();
      }
    }
  });

  /** 에이전트가 맨 위에 서고 단계가 그 아래로 뻗는다 — 대시보드 Agent OS 보드처럼. */
  it('⭐ 단계 위에 에이전트 한 명이 서고 선으로 이어진다', () => {
    render(<MallHomePage />);
    const section = document.getElementById('mall-pipeline') as HTMLElement;
    expect(within(section).getByText('쇼핑몰 에이전트')).toBeInTheDocument();
    for (const column of pipelineColumns()) {
      expect(column.querySelector('[data-connector]')).not.toBeNull();
    }
  });

  it('⭐ 기억에 남은 몰 작업 결과가 몰별 상태와 기억 칸을 채운다', () => {
    outcomes = {
      since: '2026-09-05T00:00:00.000Z',
      days: 7,
      total: 3,
      rows: [
        {
          mallKey: 'onch',
          operation: 'order_collection',
          latest: {
            id: '33333333-3333-4333-8333-333333333333',
            mallKey: 'onch',
            operation: 'order_collection',
            outcome: 'attention',
            reasonCode: 'login_required',
            message: null,
            itemCount: null,
            failedCount: null,
            warningCount: null,
            trigger: null,
            runId: null,
            occurredAt: '2026-09-12T01:00:00.000Z',
          },
          counts: { succeeded: 2, empty: 0, attention: 1, failed: 0, cancelled: 0 },
        },
      ],
    };
    render(<MallHomePage />);
    const onchTile = screen.getByRole('button', { name: '온채널 주문수집 로그인 필요' });
    expect(onchTile.className).toContain('bg-red-50');
    const remember = pipelineColumns()[5]!;
    expect(within(remember).getByText('최근 7일 3건 · 몰 1곳')).toBeInTheDocument();
  });

  it('감지 칸은 알림판과 같은 숫자를 쓴다', () => {
    seedAlerts(orderCollectionFailed, rocketResolved);
    render(<MallHomePage />);
    const sense = pipelineColumns()[1]!;
    expect(within(sense).getByText('알림 2건 · 확인 필요 1건')).toBeInTheDocument();
    expect(within(sense).getAllByRole('link', { name: /알림판/ })[0]).toHaveAttribute('href', '#mall-alerts');
  });

  /** 알림판은 대시보드 줄(몰별 상태까지)에만 선다. 파이프라인은 그 아래 넓게 선다. */
  it('⭐ 알림판은 몰별 상태까지만 — 파이프라인은 그 아래 넓게 선다', () => {
    render(<MallHomePage />);
    const aside = panel();
    const grid = aside.parentElement as HTMLElement;
    expect(within(grid.firstElementChild as HTMLElement).getByRole('heading', { name: /몰별 상태/ })).toBeInTheDocument();
    expect(aside.className).not.toContain('xl:sticky');
    const pipeline = screen.getByRole('list', { name: '에이전트 파이프라인' });
    expect(grid.contains(pipeline)).toBe(false);
    expect(grid.compareDocumentPosition(pipeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('쇼핑몰 홈 — 미션', () => {
  it('맨 위에는 제목만 둔다 — 소개 문구는 없다', () => {
    render(<MallHomePage />);
    expect(screen.getByRole('heading', { name: '쇼핑몰 에이전트' })).toBeInTheDocument();
    expect(screen.queryByText(/쇼핑몰 담당 에이전트다/)).not.toBeInTheDocument();
  });

  it('⭐ 사장님이 준 미션 넷이 맨 앞에 선다 — 번호는 붙이지 않는다', () => {
    render(<MallHomePage />);
    const owned = [
      '등록 폼이 바뀌면 스스로 고친다',
      '몰 공지와 알림을 모아 보여 준다',
      '문제가 생기면 즉시 보고한다',
      '해 본 일에서 배우고 나아진다',
    ];
    const listed = within(pipelineColumns()[0]!).getAllByRole('listitem', { name: /^미션 / });
    expect(listed.slice(0, 4).map((item) => item.getAttribute('aria-label'))).toEqual(
      owned.map((title) => `미션 ${title}`),
    );
    for (const title of owned) {
      expect(within(mission(new RegExp(`^미션 ${title}$`))).getByText('사장님 미션')).toBeInTheDocument();
    }
  });

  it('미션마다 지금 되는 것과 다음 할 일을 적는다', () => {
    render(<MallHomePage />);
    const first = mission(/^미션 등록 폼이 바뀌면/);
    expect(within(first).getByText('지금')).toBeInTheDocument();
    expect(within(first).getByText('다음')).toBeInTheDocument();
    expect(within(first).getByText('아직')).toBeInTheDocument();
  });

  it('되는 일 넷의 숫자는 쇼핑몰 현황과 같은 판정이다', () => {
    render(<MallHomePage />);
    const coverage = mission(/네 가지 일이 되게 한다/);
    // 온채널: 주문수집·송장전송 됨, 상품등록 어댑터 있음. 쿠팡 로켓: 사입이라 등록·품절 불가.
    expect(within(coverage).getByText('주문수집 1/2곳 · 송장전송 1/2곳 · 상품등록 1/2곳 · 품절관리 0/2곳')).toBeInTheDocument();
    expect(within(coverage).getByRole('link', { name: /쇼핑몰 현황/ })).toHaveAttribute('href', '/mall-channels');
  });

  it('숫자를 못 받아도 미션은 선다 — 숫자를 지어내지 않는다', () => {
    overview = undefined;
    render(<MallHomePage />);
    expect(mission(/^미션 등록 폼이 바뀌면/)).toBeInTheDocument();
    expect(within(mission(/네 가지 일이 되게 한다/)).getByText('숫자를 불러오는 중입니다.')).toBeInTheDocument();
  });

  it('지키는 원칙을 적는다 — 되돌리기 어려운 일은 사람이 누른다', () => {
    render(<MallHomePage />);
    expect(screen.getByRole('heading', { name: /지키는 원칙/ })).toBeInTheDocument();
    expect(screen.getByText(/되돌리기 어려운 일은 사람이 누른다/)).toBeInTheDocument();
  });
});

/**
 * 열면 확장이 몰마다 로그인 상태를 조용히 확인한다. 로그인은 하지 않는다 — 확장에는 몰 키만
 * 가고, 모르는 몰은 확인 불가다. 로그인 필요로 세지 않는다.
 */
describe('쇼핑몰 홈 — 로그인 상태', () => {
  const answer = (states: Record<string, 'signed_in' | 'signed_out'>) =>
    mockProbeMall.mockImplementation(async (_extensionId: string, mallKey: string) => ({
      mallKey,
      state: states[mallKey] ?? 'unknown',
      reason: states[mallKey] === 'signed_out' ? 'login_page' : states[mallKey] ? 'admin_page' : 'no_passive_check',
      checkedAt: Date.now(),
    }));

  function loginStatus(): HTMLElement {
    return screen.getByRole('status', { name: '로그인 상태' });
  }

  it('⭐ 열면 몰마다 로그인 상태를 확인한다 — 풀린 몰은 빨갛고, 알림판 · 위 칸이 말한다', async () => {
    mockDetectProbe.mockResolvedValue({ status: 'ready', extensionId: 'ext' });
    answer({ onch: 'signed_out', rocket: 'signed_in' });
    render(<MallHomePage />);

    const onchTile = await screen.findByRole('button', { name: '온채널 로그인 필요, 로그인 상태 로그인 필요' });
    expect(onchTile.className).toContain('bg-red-50');
    expect(screen.getByRole('button', { name: /^쿠팡 로켓 .*로그인 상태 로그인됨$/ }).className).not.toContain(
      'bg-red-50',
    );
    await waitFor(() => expect(loginStatus()).toHaveTextContent('로그인됨 1 · 로그인 필요 1 · 확인 불가 0'));
    expect(within(panel()).getByText('로그인이 풀린 몰 1곳')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^로그인 필요.*세션 풀림 1 · 계정 정보 없음 0$/ })).toHaveAttribute(
      'href',
      '/mall-settings',
    );
    // 확장에는 몰 키만 간다.
    expect(mockProbeMall.mock.calls).toEqual(expect.arrayContaining([['ext', 'onch'], ['ext', 'rocket']]));
  });

  it('⭐ 확인 결과를 기억에 남긴다 — 로그인됨 · 로그인 필요만, 몰 키와 이유 코드만', async () => {
    outcomes = { since: '2026-09-05T00:00:00.000Z', days: 7, total: 0, rows: [] };
    mockDetectProbe.mockResolvedValue({ status: 'ready', extensionId: 'ext' });
    answer({ onch: 'signed_out' });
    render(<MallHomePage />);

    await waitFor(() =>
      expect(queryClientStub.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['mallOperationOutcomes'] }),
    );
    const recorded = mockApiPost.mock.calls
      .filter(([url]) => url === '/api/channels/mall-operation-outcomes')
      .map(([, body]) => body as Record<string, unknown>);
    // 확인 불가(쿠팡 로켓)는 적지 않는다.
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      mallKey: 'onch',
      operation: 'login_check',
      outcome: 'attention',
      reasonCode: 'login_required',
      trigger: 'auto',
    });
    expect(Object.keys(recorded[0]!).sort()).toEqual([
      'idempotencyKey',
      'mallKey',
      'message',
      'operation',
      'outcome',
      'reasonCode',
      'trigger',
    ]);
  });

  it('10분 안에 다시 열면 몰에 다시 묻지 않는다', async () => {
    mockDetectProbe.mockResolvedValue({ status: 'ready', extensionId: 'ext' });
    answer({ onch: 'signed_in', rocket: 'signed_in' });
    const first = render(<MallHomePage />);
    await waitFor(() => expect(loginStatus()).toHaveTextContent('로그인됨 2'));
    first.unmount();
    mockDetectProbe.mockClear();
    mockProbeMall.mockClear();

    render(<MallHomePage />);
    await waitFor(() => expect(loginStatus()).toHaveTextContent('로그인됨 2'));
    expect(mockDetectProbe).not.toHaveBeenCalled();
    expect(mockProbeMall).not.toHaveBeenCalled();
  });

  it('다시 확인은 기다리지 않고 몰에 다시 묻는다', async () => {
    mockDetectProbe.mockResolvedValue({ status: 'ready', extensionId: 'ext' });
    answer({ onch: 'signed_in', rocket: 'signed_in' });
    render(<MallHomePage />);
    await waitFor(() => expect(loginStatus()).toHaveTextContent('로그인됨 2'));

    answer({ onch: 'signed_out', rocket: 'signed_in' });
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));
    await waitFor(() => expect(loginStatus()).toHaveTextContent('로그인 필요 1'));
    expect(mockProbeMall).toHaveBeenCalledTimes(4);
  });

  it('확장이 없으면 확인하지 않고 그렇다고 말한다 — 모르는 몰을 로그인 필요로 세지 않는다', async () => {
    render(<MallHomePage />);
    expect(await screen.findByText('KidItem 확장이 없어 로그인 상태를 확인하지 못했습니다.')).toBeInTheDocument();
    expect(mockProbeMall).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /^로그인 필요.*세션 풀림 — · 계정 정보 없음 0$/ })).toBeInTheDocument();
  });

  it('옛 확장이면 그 버전과 빠진 기능을 적는다 — 없는 것과 섞지 않는다', async () => {
    mockDetectProbe.mockResolvedValue({ status: 'outdated', version: '1.0.83' });
    render(<MallHomePage />);
    expect(
      await screen.findByText(/확장 1\.0\.83에는 로그인 확인\(mallSessionProbeV1\)이 없습니다/),
    ).toBeInTheDocument();
    expect(mockProbeMall).not.toHaveBeenCalled();
  });
});
