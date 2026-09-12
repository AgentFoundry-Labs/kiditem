import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MallChannelsPage from './page';

/**
 * 허브 화면이 지키는 것.
 *
 *  1. **모르는 것을 0 으로 찍지 않는다.** 리스팅을 한 번도 가져오지 않은 몰에 상품 0 ·
 *     리스팅 0 을 세우면 "이 몰엔 아무것도 없다"로 읽힌다. 실제로는 "우리가 아직 안
 *     가져왔다"이고, 그 몰에 상품이 1,000개 올라가 있을 수도 있다. 그 칸은 `—` 다.
 *  2. **연결된 몰은 한 목록이고 카드는 모두 같은 틀이다.** 주문수집 · 송장전송 · 상품등록 ·
 *     품절관리가 초록(됨) · 회색(아직) · 빨강(불가)으로 서고, 상품 · 리스팅 · 주문 칸이 늘
 *     있다. 다 되는 몰부터 선다.
 *  3. **맨 위 요약은 지금 상황만 말한다.** 고정 글자나 아래 목록을 되풀이하는 칸을 두지
 *     않는다 — 활성 상품 · 연결된 몰 · 되는 일 넷의 막대.
 */

let overview: unknown;
let manifests: unknown;

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey.includes('manifests') ? manifests : overview,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
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

function card(mallName: string): HTMLElement {
  return screen.getByRole('heading', { name: mallName }).closest('article') as HTMLElement;
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
  it('활성 상품과 연결된 몰을 센다', () => {
    render(<MallChannelsPage />);
    expect(screen.getByText('활성 상품')).toBeInTheDocument();
    expect(screen.getByText('2,951')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('⭐ 되는 일 넷을 연결된 몰 중 몇 곳인지 막대로 센다 — 아래 카드와 같은 기준', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(screen.getByRole('img', { name: '주문수집 4곳 중 1곳 됨, 3곳 아직' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '송장전송 4곳 중 0곳 됨, 4곳 아직' })).toBeInTheDocument();
    // 쿠팡·키즈노트는 어댑터가 있어 됨, 토스는 아직, 쿠팡 로켓은 등록 개념이 없어 불가.
    // 서버 숫자(publishableChannelCount 11)를 쓰지 않는다 — 카드의 초록 칸과 같은 기준이다.
    expect(screen.getByRole('img', { name: '상품등록 4곳 중 2곳 됨, 1곳 아직, 1곳 불가' })).toBeInTheDocument();
    // 품절 송신 경로는 아직 없다. 사입 채널만 불가, 나머지는 아직.
    expect(screen.getByRole('img', { name: '품절관리 4곳 중 0곳 됨, 3곳 아직, 1곳 불가' })).toBeInTheDocument();
  });

  it('예전 띠의 고정 글자와 되풀이 숫자는 없다', () => {
    render(<MallChannelsPage />);
    expect(screen.queryByText('상품이 들어오는 곳')).not.toBeInTheDocument();
    expect(screen.queryByText('상품을 보낼 수 있는 몰')).not.toBeInTheDocument();
  });
});

describe('쇼핑몰 현황 — 연결된 몰 목록', () => {
  it('연결된 몰을 한 목록으로 세운다 — 거래 유무나 등록 보드로 나누지 않는다', () => {
    render(<MallChannelsPage />);
    expect(screen.getByRole('heading', { name: /연결된 몰/ })).toBeInTheDocument();
    expect(screen.queryByText('거래가 있는 몰')).not.toBeInTheDocument();
    expect(screen.queryByText(/연결만 된 몰/)).not.toBeInTheDocument();
    // 예전 상품등록 보드는 카드의 상품등록 줄로 합쳐졌다. 같은 몰이 두 번 서지 않는다.
    expect(screen.getAllByRole('heading', { name: '키즈노트' })).toHaveLength(1);
  });

  it('색 풀이가 목록 머리에 있다', () => {
    render(<MallChannelsPage />);
    for (const word of ['됨', '아직', '불가']) expect(screen.getByText(word)).toBeInTheDocument();
  });

  it('가져온 몰은 숫자를 보여준다', () => {
    render(<MallChannelsPage />);
    const coupang = card('쿠팡(마켓플레이스)');
    expect(within(coupang).getByText('1,230')).toBeInTheDocument();
    expect(within(coupang).getByText('456')).toBeInTheDocument();
  });

  it('⭐ 안 가져온 몰도 같은 틀이다 — 칸은 있고 0 대신 — 를 찍는다', () => {
    render(<MallChannelsPage />);
    const kidsnote = card('키즈노트');
    expect(within(kidsnote).queryByText('0')).not.toBeInTheDocument();
    expect(within(kidsnote).getAllByText('—')).toHaveLength(3);
    // 모든 카드에 되는 일 네 줄과 숫자 세 칸이 같은 순서로 선다.
    for (const article of screen.getAllByRole('article')) {
      const lines = within(article).getAllByRole('listitem').map((item) => item.getAttribute('aria-label')?.split(' ')[0]);
      expect(lines).toEqual(['주문수집', '송장전송', '상품등록', '품절관리']);
      expect(within(article).getByText('상품')).toBeInTheDocument();
      expect(within(article).getByText('리스팅')).toBeInTheDocument();
      expect(within(article).getByText('주문')).toBeInTheDocument();
    }
  });

  it('주문만 있는 몰은 주문 칸에만 숫자가 선다', () => {
    overview = {
      shop: { productCount: 1, connectedChannelCount: 1, publishableChannelCount: 0 },
      channels: [idle('rocket', '쿠팡 로켓', { orderCount: 113 })],
    };
    render(<MallChannelsPage />);
    const rocket = card('쿠팡 로켓');
    expect(within(rocket).getByText('113')).toBeInTheDocument();
    expect(within(rocket).getAllByText('—')).toHaveLength(2);
  });

  it('⭐ 되는 일은 초록, 아직은 회색, 개념이 없는 일은 빨강이다', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(within(card('쿠팡(마켓플레이스)')).getByLabelText('상품등록 됨')).toBeInTheDocument();
    expect(within(card('쿠팡(마켓플레이스)')).getByLabelText('주문수집 아직')).toBeInTheDocument();
    expect(within(card('키즈노트')).getByLabelText('주문수집 됨')).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByLabelText('상품등록 불가')).toBeInTheDocument();
    expect(within(card('토스쇼핑')).getByLabelText('상품등록 아직')).toBeInTheDocument();
  });

  /**
   * 품절 송신 경로는 아직 어느 몰에도 없다(품절 관리 화면은 미리보기만). 몰이 품절을 받아도
   * 초록이 아니다. 사입 채널은 품절 송신 개념이 없어 빨강이다.
   */
  it('⭐ 품절관리는 아직 초록이 없다 — 사입 채널만 불가, 나머지는 아직', () => {
    overview = fourMalls();
    render(<MallChannelsPage />);
    expect(within(card('쿠팡(마켓플레이스)')).getByLabelText('품절관리 아직')).toHaveAttribute(
      'title',
      '몰은 품절·해제를 받습니다. 우리 송신 경로가 아직 없습니다.',
    );
    expect(within(card('쿠팡 로켓')).getByLabelText('품절관리 불가')).toBeInTheDocument();
    expect(screen.queryAllByLabelText('품절관리 됨')).toHaveLength(0);
  });

  it('완전품절이 영구삭제인 몰은 품절관리 줄에 그 사연을 적는다', () => {
    manifests = [manifest('gmarket', { hazards: { soldOutDeletesListing: true } })];
    overview = {
      shop: { productCount: 1, connectedChannelCount: 1, publishableChannelCount: 1 },
      channels: [idle('gmarket', '지마켓')],
    };
    render(<MallChannelsPage />);
    expect(within(card('지마켓')).getByLabelText('품절관리 아직').getAttribute('title'))
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
    const auction = within(card('옥션')).getByLabelText('상품등록 됨');
    expect(auction).toHaveAttribute('title', 'G마켓 · 옥션 등록 한 번에 함께 올라갑니다.');
    const gmarket = within(card('지마켓')).getByLabelText('상품등록 됨');
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
    const order = screen.getAllByRole('article')
      .map((article) => within(article).getByRole('heading').textContent);
    expect(order).toEqual(['온채널', '키즈노트', '토스쇼핑']);
  });

  it('매니페스트를 못 받으면 없는 일로 단정하지 않는다 — 빨강 대신 회색', () => {
    manifests = undefined;
    overview = {
      shop: { productCount: 1, connectedChannelCount: 1, publishableChannelCount: 0 },
      channels: [idle('rocket', '쿠팡 로켓')],
    };
    render(<MallChannelsPage />);
    expect(within(card('쿠팡 로켓')).getByLabelText('상품등록 아직')).toBeInTheDocument();
    expect(within(card('쿠팡 로켓')).getByLabelText('품절관리 아직')).toBeInTheDocument();
  });

  it('없는 기능을 버튼으로 만들지 않는다 — 채널 추가 대신 계정 설정으로 보낸다', () => {
    render(<MallChannelsPage />);
    // 몰 목록은 서버 고정 카탈로그다. 새로 만드는 API 가 없다.
    expect(screen.queryByText(/채널 추가/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /계정 설정/ })).toHaveAttribute('href', '/mall-settings');
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
