import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MallChannelsPage from './page';

/**
 * 허브 화면이 지키는 것.
 *
 *  1. **모르는 것을 0 으로 찍지 않는다.** 리스팅을 한 번도 가져오지 않은 몰에 등록 상품 0 을
 *     세우면 "이 몰엔 아무것도 없다"로 읽힌다. 실제로는 "우리가 아직 안 가져왔다"이다. 그 칸은 `—` 다.
 *  2. **연결된 몰은 한 표다 — 사방넷 스케줄러와 같은 모양.** 줄마다 쇼핑몰 · 쇼핑몰 ID ·
 *     사용여부 · 설정 · 등록 상품, 그리고 되는 일 아홉 칸(주문수집 · 클레임수집 · 운송장 송신 ·
 *     문의수집 · 문의답변 · 상품등록 · 상품수정 · 상품상태송신 · 재고송신)이 초록(됨) ·
 *     회색(아직) · 빨강(불가)으로 선다. 다 되는 몰부터 선다.
 *  3. **칸 머리가 몇 곳에서 되는지 말한다.** 맨 위 요약은 표시 상품 · 연결된 몰 둘이다.
 */

let overview: unknown;
let manifests: unknown;

/** 쇼핑몰 계정 화면의 계정 목록 — 쇼핑몰 ID · 사용여부 칸이 읽는다. */
let mallAccounts: unknown;

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey.includes('manifests')
      ? manifests
      : queryKey.includes('malls')
        ? mallAccounts
        : overview,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

// 실제 next/link 는 aria-label 을 그대로 넘긴다. 아이콘만 있는 링크의 이름이 거기서 나온다.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

function channel(overrides: Record<string, unknown> = {}) {
  return {
    mallKey: 'coupang',
    mallName: '쿠팡 WING',
    channelAccountId: 'acc-1',
    canPublish: true,
    hasCredentials: true,
    imported: true,
    collectsOrders: false,
    uploadsTracking: false,
    listingCount: 1230,
    orderCount: 0,
    productCount: 456,
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
  mallAccounts = [
    { key: 'kidsnote', loginId: 'store_kiditem', enabled: true },
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
  /**
   * 맨 위 숫자는 등록 현황 표와 같은 집합이다 — 품절 상품도 표에 서므로 여기도 센다.
   * '활성'이라고 부르면 품절된 줄이 표에 보이는데 숫자에는 빠져 둘이 갈라진다.
   */
  it('⭐ 표시 상품과 연결된 몰을 센다 — 등록 현황 표와 같은 기준', () => {
    render(<MallChannelsPage />);
    expect(screen.getByText('표시 상품')).toBeInTheDocument();
    expect(screen.getByText('등록 현황 표 기준')).toBeInTheDocument();
    expect(screen.queryByText('활성 상품')).not.toBeInTheDocument();
    expect(screen.getByText('2,951')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('⭐ 칸 머리가 되는 일마다 연결된 몰 중 몇 곳인지 막대로 센다 — 아래 줄과 같은 기준', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(screen.getByRole('img', { name: '주문수집 4곳 중 1곳 됨, 3곳 아직' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '운송장 송신 4곳 중 0곳 됨, 4곳 아직' })).toBeInTheDocument();
    // 쿠팡·키즈노트는 어댑터가 있어 됨, 토스는 아직, 쿠팡 로켓은 등록 개념이 없어 불가.
    // 서버 숫자(publishableChannelCount 11)를 쓰지 않는다 — 줄의 초록 칸과 같은 기준이다.
    expect(screen.getByRole('img', { name: '상품등록 4곳 중 2곳 됨, 1곳 아직, 1곳 불가' })).toBeInTheDocument();
    // 품절 · 판매중지 송신 경로는 아직 없다. 사입 채널만 불가, 나머지는 아직.
    expect(screen.getByRole('img', { name: '상품상태송신 4곳 중 0곳 됨, 3곳 아직, 1곳 불가' })).toBeInTheDocument();
    // 새로 붙은 칸 — 아직 경로가 없다. 사입 채널에는 그 일이 없다.
    for (const label of ['클레임수집', '문의수집', '문의답변', '상품수정', '재고송신']) {
      expect(screen.getByRole('img', { name: `${label} 4곳 중 0곳 됨, 3곳 아직, 1곳 불가` })).toBeInTheDocument();
    }
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
    expect(screen.getByRole('heading', { name: /연결된 몰/ })).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent?.replace(/[\d/\s]+$/, '').trim());
    expect(headers).toEqual([
      '쇼핑몰',
      '쇼핑몰 ID',
      '사용여부',
      '설정',
      '등록 상품',
      '주문수집',
      '클레임수집',
      '운송장 송신',
      '문의수집',
      '문의답변',
      '상품등록',
      '상품수정',
      '상품상태송신',
      '재고송신',
    ]);
    // 같은 몰이 두 번 서지 않는다.
    expect(screen.getAllByRole('rowheader', { name: '키즈노트' })).toHaveLength(1);
  });

  it('색 풀이가 표 머리에 있다', () => {
    render(<MallChannelsPage />);
    for (const word of ['됨', '아직', '불가']) expect(screen.getAllByText(word).length).toBeGreaterThan(0);
  });

  it('⭐ 쇼핑몰 ID · 사용여부는 쇼핑몰 계정 화면의 값이다 — 계정이 없으면 없다고 적는다', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(within(card('키즈노트')).getByText('store_kiditem')).toBeInTheDocument();
    expect(within(card('키즈노트')).getByText('사용')).toBeInTheDocument();
    // 쿠팡 로켓의 자격증명은 쇼핑몰 계정에서 '쿠팡직배송' 으로 불린다(ADR-0012).
    expect(within(card('쿠팡 로켓')).getByText('kiditem01')).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByText('미사용')).toBeInTheDocument();
    expect(within(card('토스쇼핑')).getByText('계정 없음')).toBeInTheDocument();
    expect(within(card('토스쇼핑')).getByRole('link', { name: '토스쇼핑 계정 설정' })).toHaveAttribute(
      'href',
      '/mall-settings',
    );
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
    expect(orders).toHaveTextContent('셀피아');
    expect(orders).toHaveAttribute('title', expect.stringContaining('셀피아 주문수집으로 들어옵니다'));
  });

  it('가져온 몰은 등록 상품 수를 보여준다', () => {
    render(<MallChannelsPage />);
    const coupang = card('쿠팡 WING');
    expect(within(coupang).getByText('456')).toBeInTheDocument();
    expect(within(coupang).getByTitle('리스팅 1,230개 · 주문 0건')).toBeInTheDocument();
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
    expect(within(card('쿠팡 WING')).getByRole('img', { name: '상품등록 됨' })).toBeInTheDocument();
    expect(within(card('쿠팡 WING')).getByRole('img', { name: '주문수집 아직' })).toBeInTheDocument();
    expect(within(card('키즈노트')).getByRole('img', { name: '주문수집 됨' })).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '상품등록 불가' })).toBeInTheDocument();
    expect(within(card('토스쇼핑')).getByRole('img', { name: '상품등록 아직' })).toBeInTheDocument();
  });

  /**
   * 품절 · 판매중지 송신 경로는 아직 어느 몰에도 없다(품절 관리 화면은 미리보기만). 몰이 품절을
   * 받아도 초록이 아니다. 사입 채널은 품절 송신 개념이 없어 빨강이다.
   */
  it('⭐ 상품상태송신은 아직 초록이 없다 — 사입 채널만 불가, 나머지는 아직', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(within(card('쿠팡 WING')).getByRole('img', { name: '상품상태송신 아직' })).toHaveAttribute(
      'title',
      '몰은 품절·해제를 받습니다. 우리 송신 경로가 아직 없습니다.',
    );
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '상품상태송신 불가' })).toBeInTheDocument();
    expect(screen.queryAllByRole('img', { name: '상품상태송신 됨' })).toHaveLength(0);
  });

  it('완전품절이 영구삭제인 몰은 상품상태송신 칸에 그 사연을 적는다', () => {
    manifests = [manifest('gmarket', { hazards: { soldOutDeletesListing: true } })];
    overview = {
      shop: { productCount: 1, connectedChannelCount: 1, publishableChannelCount: 1 },
      channels: [idle('gmarket', '지마켓')],
    };
    render(<MallChannelsPage />);
    expect(within(card('지마켓')).getByRole('img', { name: '상품상태송신 아직' }).getAttribute('title'))
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

  /**
   * '그 일이 없다'(빨강)는 채널 레지스트리가 답한다 — 매니페스트를 못 받아도 사입 채널은
   * 사입 채널이다(KID-250). 못 받아서 모르는 것은 몰 방식(품절 사연)뿐이고, 등록 경로가
   * 확인 전인 몰은 여전히 '아직' 이다.
   */
  it('⭐ 매니페스트를 못 받아도 사입 채널은 빨강, 확인 전 몰은 회색이다', () => {
    manifests = undefined;
    overview = {
      shop: { productCount: 1, connectedChannelCount: 2, publishableChannelCount: 0 },
      channels: [idle('rocket', '쿠팡 로켓'), idle('toss', '토스쇼핑')],
    };
    render(<MallChannelsPage />);
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '상품등록 불가' })).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByRole('img', { name: '재고송신 불가' })).toBeInTheDocument();
    expect(within(card('토스쇼핑')).getByRole('img', { name: '상품등록 아직' })).toBeInTheDocument();
    expect(within(card('토스쇼핑')).getByRole('img', { name: '상품상태송신 아직' })).toBeInTheDocument();
    expect(within(card('토스쇼핑')).getByRole('img', { name: '재고송신 아직' })).toBeInTheDocument();
  });

  it('없는 기능을 버튼으로 만들지 않는다 — 채널 추가 대신 계정 설정으로 보낸다', () => {
    render(<MallChannelsPage />);
    // 몰 목록은 서버 고정 카탈로그다. 새로 만드는 API 가 없다.
    expect(screen.queryByText(/채널 추가/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '계정 설정' })).toHaveAttribute('href', '/mall-settings');
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
