import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MallChannelsPage from './page';

/**
 * 허브 화면이 지키는 것.
 *
 *  1. **모르는 것을 0 으로 찍지 않는다.** 리스팅을 한 번도 가져오지 않은 몰에 등록 상품 0 을
 *     세우면 "이 몰엔 아무것도 없다"로 읽힌다. 실제로는 "우리가 아직 안 가져왔다"이다. 그 칸은 `—` 다.
 *  2. **연결된 몰은 한 표다 — 사방넷 스케줄러와 같은 모양.** 줄마다 쇼핑몰 · 쇼핑몰 ID ·
 *     사용여부 · 설정 · 등록 상품, 그리고 되는 일 열 칸(주문수집 · 운송장 송신 · 상품등록 ·
 *     품절관리 · 판매재개 · 클레임수집 · 문의수집 · 문의답변 · 상품수정 · 재고송신)이 초록(됨) ·
 *     회색(아직) · 빨강(불가)으로 선다. 다 되는 몰부터 선다.
 *  3. **칸 머리가 몇 곳에서 되는지 말한다.** 맨 위 요약은 활성 상품 · 연결된 몰 둘이다.
 */

let overview: unknown;
let manifests: unknown;
/** 주소의 쿼리 — `?account=` 가 계정 설정 창을 연다. */
let searchParams: URLSearchParams;
const mockReplace = vi.fn();

/** 쇼핑몰 계정 화면의 계정 목록 — 쇼핑몰 ID · 사용여부 칸이 읽는다. */
let mallAccounts: unknown;
/** 재고 owner 의 셀피아 스냅샷 요약 — 맨 위 대시보드가 읽는다. */
let sellpiaSnapshot: unknown;

const coupangSettings = { configured: true, vendorId: 'A00057379', status: 'active', updatedAt: null };

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey.includes('manifests')
      ? manifests
      : queryKey.includes('malls')
        ? mallAccounts
        : queryKey.includes('sellpia-skus')
          ? sellpiaSnapshot
          : queryKey.includes('coupangAccount')
            ? coupangSettings
            : overview,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

// 사방넷 가져오기 컨트롤은 수집 원천 훅(뮤테이션 · 폴링)을 쓴다. 그 동작은 컨트롤 쪽 스펙이
// 본다 — 여기서는 어디에 서는지만 확인한다.
vi.mock('../_shared/SabangnetListingsImport', () => ({
  SabangnetListingsImport: () => <button type="button">사방넷에서 가져오기</button>,
}));

vi.mock('../_shared/MallAdminListingsImport', () => ({
  MallAdminListingsImport: ({ mallKey, layout }: { mallKey: string; layout?: string }) => (
    <button type="button" data-layout={layout}>{mallKey}에서 가져오기</button>
  ),
}));

vi.mock('../_shared/CoupangWingExcelImport', () => ({
  CoupangWingExcelImport: () => <div data-testid="coupang-wing-excel-import" />,
}));

vi.mock('../_shared/CoupangCatalogEdit', () => ({
  CoupangCatalogEdit: () => <div data-testid="coupang-catalog-edit" />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParams,
}));

// 창 안의 편집(초안 · 비밀번호 보기 · 저장)은 창 스펙이 본다 — 여기서는 어떤 창이 열리는지만 본다.
vi.mock('../../(orders)/mall-settings/components/MallAccountSettingsDialog', () => ({
  MallAccountSettingsDialog: ({
    target,
    mallName,
    onClose,
  }: { target: string | null; mallName?: string; onClose: () => void }) =>
    target === null ? null : (
      <div role="dialog" aria-label={`계정 설정 창 ${target}`}>
        {mallName}
        <button type="button" onClick={onClose}>창 닫기</button>
      </div>
    ),
}));

function channel(overrides: Record<string, unknown> = {}) {
  return {
    mallKey: 'coupang',
    mallName: '쿠팡(마켓플레이스)',
    channelAccountId: 'acc-1',
    canPublish: true,
    hasCredentials: true,
    imported: true,
    collectsOrders: false,
    uploadsTracking: false,
    listingCount: 1230,
    onSaleListingCount: 1000,
    onSaleLinkedListingCount: 800,
    orderCount: 0,
    productCount: 456,
    onSaleProductCount: 400,
    readiness: 'ready',
    ...overrides,
  };
}

const idle = (mallKey: string, mallName: string, overrides: Record<string, unknown> = {}) => channel({
  mallKey,
  mallName,
  imported: false,
  listingCount: 0,
  orderCount: 0,
  productCount: 0,
  readiness: 'unsupported',
  canPublish: false,
  ...overrides,
});

/** 서버 매니페스트 한 줄. 이 화면이 읽는 조각만 적는다. */
const manifest = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  applicable: true,
  unverified: false,
  supports: { soldOut: true },
  hazards: { soldOutDeletesListing: false },
  ...overrides,
});

beforeEach(() => {
  searchParams = new URLSearchParams();
  mockReplace.mockReset();
  sellpiaSnapshot = {
    items: [],
    total: 1828,
    page: 1,
    limit: 1,
    summary: {
      totalSkus: 1828,
      linkedSkus: 1065,
      unlinkedSkus: 763,
      inStockSkus: 949,
      outOfStockSkus: 879,
      totalUnits: 0,
      pricedAssetValue: 0,
      unpricedSkuCount: 0,
    },
    latestCollection: { operationId: '11111111-1111-4111-8111-111111111111', completedAt: '2026-09-17T14:28:29.000Z', generation: '3' },
  };
  mallAccounts = [
    { key: 'kidsnote', loginId: 'store_kiditem', enabled: true, siteUrl: 'https://shop.kidsnote.com/_manage/' },
    { key: 'coupang-direct', loginId: 'kiditem01', enabled: false },
  ];
  manifests = [
    manifest('coupang'),
    manifest('rocket', { applicable: false, supports: { soldOut: false } }),
  ];
  overview = {
    shop: { productCount: 2951, connectedChannelCount: 25, publishableChannelCount: 11 },
    channels: [
      channel(),
      idle('kidsnote', '키즈노트', { readiness: 'needs_profile', collectsOrders: true }),
    ],
  };
});

/** 표에서 그 몰의 줄. */
function card(mallName: string): HTMLElement {
  return screen.getByRole('rowheader', { name: mallName }).closest('tr') as HTMLElement;
}

const fourMalls = () => ({
  shop: { productCount: 1, connectedChannelCount: 4, publishableChannelCount: 11 },
  channels: [
    channel(),
    idle('kidsnote', '키즈노트', { collectsOrders: true }),
    idle('rocket', '쿠팡 로켓', { orderCount: 113 }),
    idle('toss', '토스쇼핑'),
  ],
});

describe('쇼핑몰 현황 — 맨 위 요약', () => {
  it('⭐ 맨 위는 셀피아 영역이다 — 셀피아 상품 · 재고 있음 · 품절 · 몰에 연결, 연동된 쇼핑몰 수는 표 머리에', () => {
    render(<MallChannelsPage />);
    const summary = screen.getByRole('region', { name: '셀피아' });
    expect(within(summary).getByRole('heading', { name: '셀피아' })).toBeInTheDocument();
    expect(within(summary).getByText('1,828개')).toBeInTheDocument();
    expect(within(summary).getByText('949개')).toBeInTheDocument();
    expect(within(summary).getByText('879개')).toBeInTheDocument();
    expect(within(summary).getByText('1,065개')).toBeInTheDocument();
    expect(within(summary).getByText('미연결 763개')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^연동된 쇼핑몰\s*25곳$/ })).toBeInTheDocument();
    expect(screen.queryByText('다 되는 몰부터')).not.toBeInTheDocument();
    // 상품 마스터 수는 셀피아와 같은 코드의 중복 마스터가 섞여 크게 나온다 — 적지 않는다.
    expect(screen.queryByText('활성 상품')).not.toBeInTheDocument();
    expect(screen.queryByText('2,951')).not.toBeInTheDocument();
    // 카드를 누르면 그 조건으로 거른 재고 화면이 열린다.
    expect(within(summary).getByRole('link', { name: /품절/ })).toHaveAttribute('href', '/inventory-hub?stockStatus=out_of_stock');
  });

  it('셀피아 재고를 아직 가져오지 않았으면 0 대신 — 이다', () => {
    sellpiaSnapshot = { items: [], total: 0, page: 1, limit: 1, summary: {
      totalSkus: 0, linkedSkus: 0, unlinkedSkus: 0, inStockSkus: 0, outOfStockSkus: 0, totalUnits: 0, pricedAssetValue: 0, unpricedSkuCount: 0,
    }, latestCollection: null };
    render(<MallChannelsPage />);
    const summary = screen.getByRole('region', { name: '셀피아' });
    expect(within(summary).getByText('셀피아 재고를 아직 가져오지 않았습니다.')).toBeInTheDocument();
    expect(within(summary).queryByText('0개')).not.toBeInTheDocument();
  });

  it('⭐ 칸 머리가 되는 일마다 연결된 몰 중 몇 곳인지 막대로 센다 — 아래 줄과 같은 기준', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(screen.getByRole('img', { name: '주문수집 4곳 중 1곳 됨, 3곳 아직' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '운송장 송신 4곳 중 0곳 됨, 4곳 아직' })).toBeInTheDocument();
    // 쿠팡·키즈노트는 어댑터가 있어 됨, 토스는 아직, 쿠팡 로켓은 등록 개념이 없어 불가.
    // 서버 숫자(publishableChannelCount 11)를 쓰지 않는다 — 줄의 초록 칸과 같은 기준이다.
    expect(screen.getByRole('img', { name: '상품등록 4곳 중 2곳 됨, 1곳 아직, 1곳 불가' })).toBeInTheDocument();
    // 이 몰들에는 품절 · 판매재개 송신 경로가 없다(매니페스트에 길이 없다). 사입 채널만 불가, 나머지는 아직.
    expect(screen.getByRole('img', { name: '품절관리 4곳 중 0곳 됨, 3곳 아직, 1곳 불가' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '판매재개 4곳 중 0곳 됨, 3곳 아직, 1곳 불가' })).toBeInTheDocument();
    // 새로 붙은 칸 — 아직 경로가 없다. 사입 채널에는 그 일이 없다.
    for (const label of ['클레임수집', '문의수집', '문의답변', '상품수정', '재고송신']) {
      expect(screen.getByRole('img', { name: `${label} 4곳 중 0곳 됨, 3곳 아직, 1곳 불가` })).toBeInTheDocument();
    }
  });

  it('쿠팡 WING 줄은 쿠팡 계정 설정의 vendorId 를 계정으로 보인다 — 주문수집 몰 계정이 아니어도 "계정 없음"이 아니다', () => {
    render(<MallChannelsPage />);
    expect(screen.getByText('A00057379')).toBeInTheDocument();
  });

  it('예전 띠의 고정 글자와 되풀이 숫자는 없다', () => {
    render(<MallChannelsPage />);
    expect(screen.queryByText('상품이 들어오는 곳')).not.toBeInTheDocument();
    expect(screen.queryByText('상품을 보낼 수 있는 몰')).not.toBeInTheDocument();
  });
});

describe('쇼핑몰 현황 — 연결된 몰 표', () => {
  it('⭐ 사방넷 스케줄러와 같은 칸으로 선다', () => {
    render(<MallChannelsPage />);
    expect(screen.getByRole('heading', { name: /연동된 쇼핑몰/ })).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent?.replace(/[\d/\s]+$/, '').trim());
    expect(headers).toEqual([
      '쇼핑몰',
      '쇼핑몰 ID',
      '사용여부',
      '설정',
      '상품 가져오기',
      '등록 상품판매중/전체',
      '매칭률비율연결/판매중',
      // 자주 보는 일부터(사장님 2026-09-19), 나머지는 뒤로.
      '주문수집',
      '운송장 송신',
      '상품등록',
      // 판매상품 → 몰 대량등록 엑셀(사장님 2026-09-20 "여기다가도 열 하나 만들어서 정리해주고").
      '대량등록',
      '품절관리',
      '판매재개',
      '클레임수집',
      '문의수집',
      '문의답변',
      '상품수정',
      '재고송신',
    ]);
    // 같은 몰이 두 번 서지 않는다.
    expect(screen.getAllByRole('rowheader', { name: '키즈노트' })).toHaveLength(1);
  });

  it('색 풀이가 표 머리에 있다', () => {
    render(<MallChannelsPage />);
    for (const word of ['됨', '아직', '불가']) expect(screen.getAllByText(word).length).toBeGreaterThan(0);
  });

  it('⭐ 쇼핑몰 ID · 사용여부는 쇼핑몰 계정의 값이다 — 계정이 없으면 없다고 적는다', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(within(card('키즈노트')).getByText('store_kiditem')).toBeInTheDocument();
    expect(within(card('키즈노트')).getByText('사용')).toBeInTheDocument();
    // 쿠팡 로켓의 자격증명은 쇼핑몰 계정에서 '쿠팡직배송' 으로 불린다(ADR-0012).
    expect(within(card('쿠팡 로켓')).getByText('kiditem01')).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByText('미사용')).toBeInTheDocument();
    expect(within(card('토스쇼핑')).getByText('계정 없음')).toBeInTheDocument();
  });

  it('⭐ 몰 칸을 누르면 계정에 저장된 사이트가 새 탭으로 열린다 — 주소가 없으면 링크가 아니다', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    const link = within(card('키즈노트')).getByRole('link', { name: '키즈노트' });
    expect(link).toHaveAttribute('href', 'https://shop.kidsnote.com/_manage/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(card('토스쇼핑')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('⭐ 줄의 설정은 그 몰의 계정 설정 창을 연다 — 쇼핑몰 계정은 따로 된 화면이 아니다', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(within(card('토스쇼핑')).getByRole('button', { name: '토스쇼핑 계정 설정' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/mall-channels?account=toss', { scroll: false });
    // 쿠팡 로켓의 계정은 '쿠팡직배송' 줄이다.
    fireEvent.click(within(card('쿠팡 로켓')).getByRole('button', { name: '쿠팡 로켓 계정 설정' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/mall-channels?account=coupang-direct', { scroll: false });
  });

  it('주소의 ?account= 가 창을 열고, 닫으면 주소에서 지운다', () => {
    overview = fourMalls();
    searchParams = new URLSearchParams('account=coupang-direct');
    render(<MallChannelsPage />);
    const dialog = screen.getByRole('dialog', { name: '계정 설정 창 coupang-direct' });
    expect(dialog).toHaveTextContent('쿠팡 로켓');

    fireEvent.click(within(dialog).getByRole('button', { name: '창 닫기' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/mall-channels', { scroll: false });
  });

  it('⭐ 셀피아가 주문을 가져오는 몰은 "셀피아 주문수집 됨"으로 선다', () => {
    overview = {
      ...(overview as object),
      channels: [
        channel(),
        idle('11st', '11번가', { collectsOrders: true, orderCollectionVia: 'sellpia' }),
      ],
    };

    render(<MallChannelsPage />);

    const orders = within(card('11번가')).getByRole('img', { name: '셀피아 주문수집 됨' });
    // 셀피아 칸은 ON 자리에 '셀피아'라고 적는다(사장님 2026-09-19).
    expect(orders).toHaveTextContent(/^셀피아$/);
    expect(orders).toHaveAttribute('title', expect.stringContaining('셀피아 주문수집으로 들어옵니다'));
  });

  it('⭐ 가져온 몰의 등록 상품은 몰에 올라간 상품의 판매중/전체다 — 가져온 개수와 같은 단위', () => {
    render(<MallChannelsPage />);
    const registered = within(card('쿠팡(마켓플레이스)')).getByTitle(/몰에 올라간 상품 1,230개 중 1,000개가 판매중입니다/);
    expect(registered).toHaveTextContent('1,000/1,230');
    // 우리 상품(마스터) 기준 숫자는 툴팁에만 남는다.
    expect(registered).toHaveAttribute('title', expect.stringContaining('우리 상품(마스터)으로는 456개 중 400개 · 주문 0건'));
  });

  it('⭐ 매칭률의 분모는 등록 상품 칸의 판매중이다 — 옵션이 모두 이어진 판매중 상품의 비율', () => {
    render(<MallChannelsPage />);
    const rate = within(card('쿠팡(마켓플레이스)')).getByTitle(/판매중 상품 1,000개 중 800개가 셀피아 재고에 이어졌습니다/);
    expect(rate).toHaveTextContent('80%800/1,000');
  });

  it('⭐ 안 가져온 몰은 0 대신 — 를 찍는다', () => {
    render(<MallChannelsPage />);
    const kidsnote = card('키즈노트');
    expect(within(kidsnote).queryByText('0')).not.toBeInTheDocument();
    expect(within(kidsnote).getByTitle(/아직 가져오지 않았습니다/)).toHaveTextContent('—');
  });

  it('⭐ 되는 일은 초록, 아직은 회색, 개념이 없는 일은 빨강이다', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(within(card('쿠팡(마켓플레이스)')).getByRole('img', { name: '상품등록 됨' })).toBeInTheDocument();
    expect(within(card('쿠팡(마켓플레이스)')).getByRole('img', { name: '주문수집 아직' })).toBeInTheDocument();
    // 사방넷처럼 ON/OFF 스위치 모양이다 — 되면 ON, 아직이면 OFF, 없는 일은 불가(사장님 2026-09-19).
    expect(within(card('키즈노트')).getByRole('img', { name: '주문수집 됨' })).toHaveTextContent(/^ON$/);
    expect(within(card('토스쇼핑')).getByRole('img', { name: '상품등록 아직' })).toHaveTextContent(/^OFF$/);
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '상품등록 불가' })).toHaveTextContent(/^불가$/);
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '상품등록 불가' })).toBeInTheDocument();
    expect(within(card('토스쇼핑')).getByRole('img', { name: '상품등록 아직' })).toBeInTheDocument();
  });

  /**
   * 매니페스트에 우리 송신 길(`soldOutRoute` · `resumeRoute`)이 없는 몰은 몰이 품절을 받아도 초록이 아니다.
   * 사입 채널은 품절 송신 개념이 없어 빨강이다.
   */
  it('⭐ 길이 없는 몰의 품절관리 · 판매재개는 초록이 아니다 — 사입 채널만 불가, 나머지는 아직', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(within(card('쿠팡(마켓플레이스)')).getByRole('img', { name: '품절관리 아직' })).toHaveAttribute(
      'title',
      '몰은 품절·해제를 받습니다. 우리 송신 경로가 아직 없습니다.',
    );
    expect(within(card('쿠팡(마켓플레이스)')).getByRole('img', { name: '판매재개 아직' })).toHaveAttribute(
      'title',
      '몰은 판매재개를 받습니다. 우리 송신 경로가 아직 없습니다.',
    );
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '품절관리 불가' })).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '판매재개 불가' })).toBeInTheDocument();
    expect(screen.queryAllByRole('img', { name: '품절관리 됨' })).toHaveLength(0);
    expect(screen.queryAllByRole('img', { name: '판매재개 됨' })).toHaveLength(0);
  });

  /**
   * 사장님 2026-09-19: "품절관리랑 판매재개 기능 구별해서 되는지 구별해놔줘". 두 일은 칸이 따로다 —
   * 길이 있는 몰은 둘 다 초록이고, 몰이 품절 해제를 자동으로 받지 않으면 판매재개만 빨강이다.
   */
  it('⭐ 품절관리 · 판매재개가 칸 둘로 갈린다 — 몰이 해제를 안 받으면 판매재개만 빨강', () => {
    manifests = [
      manifest('coupang', { supports: { soldOut: true, resume: true }, soldOutRoute: 'mall_admin', resumeRoute: 'mall_admin' }),
      manifest('haebub-mall', { supports: { soldOut: true, resume: false }, soldOutRoute: 'mall_admin', resumeRoute: null }),
    ];
    overview = {
      shop: { productCount: 1, connectedChannelCount: 2, publishableChannelCount: 2 },
      channels: [channel(), idle('haebub-mall', '해법몰')],
    };
    render(<MallChannelsPage />);
    const coupang = card('쿠팡(마켓플레이스)');
    // 길이 있는 칸에 "경로가 아직 없다"는 사연을 붙이지 않는다 — 칸의 기본 설명이 선다.
    expect(within(coupang).getByRole('img', { name: '품절관리 됨' }).getAttribute('title')).toContain('품절을 보낼 수 있습니다');
    expect(within(coupang).getByRole('img', { name: '판매재개 됨' }).getAttribute('title')).toContain('판매재개(품절 해제)를 보낼 수 있습니다');
    const haebub = card('해법몰');
    expect(within(haebub).getByRole('img', { name: '품절관리 됨' })).toBeInTheDocument();
    expect(within(haebub).getByRole('img', { name: '판매재개 불가' }).getAttribute('title')).toContain('직접 풀어야');
    expect(screen.getByRole('img', { name: '판매재개 2곳 중 1곳 됨, 0곳 아직, 1곳 불가' })).toBeInTheDocument();
  });

  it('완전품절이 영구삭제인 몰은 품절관리 칸에 그 사연을 적는다', () => {
    manifests = [manifest('gmarket', { hazards: { soldOutDeletesListing: true } })];
    overview = {
      shop: { productCount: 1, connectedChannelCount: 1, publishableChannelCount: 1 },
      channels: [idle('gmarket', '지마켓')],
    };
    render(<MallChannelsPage />);
    expect(within(card('지마켓')).getByRole('img', { name: '품절관리 아직' }).getAttribute('title'))
      .toContain('판매중지로 보내야');
  });

  /**
   * ESM Plus 는 G마켓 등록 한 번이 옥션까지 올라간다. 옥션에 버튼은 따로 없지만,
   * 허브가 옥션 상품등록을 '아직' 으로 칠하면 따로 등록해야 하는 몰로 읽힌다.
   */
  it('⭐ 옥션은 G마켓 등록에 함께 올라가므로 상품등록이 초록이다', () => {
    manifests = [manifest('gmarket'), manifest('auction')];
    overview = {
      shop: { productCount: 1, connectedChannelCount: 2, publishableChannelCount: 2 },
      channels: [idle('gmarket', '지마켓'), idle('auction', '옥션')],
    };
    render(<MallChannelsPage />);
    const auction = within(card('옥션')).getByRole('img', { name: '상품등록 됨' });
    expect(auction).toHaveAttribute('title', 'G마켓 · 옥션 등록 한 번에 함께 올라갑니다.');
    const gmarket = within(card('지마켓')).getByRole('img', { name: '상품등록 됨' });
    expect(gmarket).toHaveAttribute('title', '옥션까지 한 번에 올라갑니다.');
  });

  it('다 되는 몰부터 선다', () => {
    overview = {
      shop: { productCount: 1, connectedChannelCount: 3, publishableChannelCount: 2 },
      channels: [
        idle('toss', '토스쇼핑'),
        idle('kidsnote', '키즈노트', { collectsOrders: true }),
        idle('onch', '온채널', { collectsOrders: true, uploadsTracking: true }),
      ],
    };
    render(<MallChannelsPage />);
    const order = screen.getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(order).toEqual(['온채널', '키즈노트', '토스쇼핑']);
  });

  it('매니페스트가 없어도 레지스트리가 정의한 발주 전용 채널에는 상품등록이 없다', () => {
    manifests = undefined;
    overview = {
      shop: { productCount: 1, connectedChannelCount: 1, publishableChannelCount: 0 },
      channels: [idle('rocket', '쿠팡 로켓')],
    };
    render(<MallChannelsPage />);
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '상품등록 불가' })).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '품절관리 불가' })).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '판매재개 불가' })).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '재고송신 불가' })).toBeInTheDocument();
  });

  it('없는 기능을 버튼으로 만들지 않는다 — 채널 추가 대신 모든 몰의 계정 설정 창을 연다', () => {
    render(<MallChannelsPage />);
    // 몰 목록은 서버 고정 카탈로그다. 새로 만드는 API 가 없다.
    expect(screen.queryByText(/채널 추가/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '계정 설정' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/mall-channels?account=all', { scroll: false });
  });

  it('⭐ 사방넷 등록 상품은 표 아래에서 한꺼번에 가져온다 — 몰마다 따로 누르지 않는다', () => {
    render(<MallChannelsPage />);
    expect(screen.getAllByRole('button', { name: '사방넷에서 가져오기' })).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: '사방넷에서 가져오기' })).getByRole('button', { name: '사방넷에서 가져오기' }))
      .toBeInTheDocument();
  });

  it('⭐ 몰 관리자에서 가져오는 몰은 그 몰 줄에서 가져온다 — 머리에는 계정 설정만 선다', () => {
    overview = {
      ...(overview as object),
      channels: [channel(), idle('kidkids', '키드키즈')],
    };
    render(<MallChannelsPage />);
    const kidkids = within(card('키드키즈')).getByRole('button', { name: 'kidkids에서 가져오기' });
    expect(kidkids).toHaveAttribute('data-layout', 'row');
    // 사방넷으로 들어오는 몰 줄에는 가져오기가 없다.
    expect(within(card('쿠팡(마켓플레이스)')).queryByRole('button', { name: /에서 가져오기/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /에서 가져오기/ })).toHaveLength(2);
  });

  it('연결된 몰이 없으면 빈 상태를 보여준다', () => {
    overview = {
      shop: { productCount: 0, connectedChannelCount: 0, publishableChannelCount: 0 },
      channels: [],
    };
    render(<MallChannelsPage />);
    expect(screen.getByText('연결된 몰이 없습니다.')).toBeInTheDocument();
  });
});
