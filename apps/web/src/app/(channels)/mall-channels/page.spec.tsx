import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MallChannelsPage from './page';

/**
 * 허브 화면이 지키는 것: **모르는 것을 0 으로 찍지 않는다.**
 *
 * 리스팅을 한 번도 가져오지 않은 몰에 상품 0 · 리스팅 0 을 세우면 "이 몰엔
 * 아무것도 없다"로 읽힌다. 실제로는 "우리가 아직 안 가져왔다"이고, 그 몰에
 * 상품이 1,000개 올라가 있을 수도 있다.
 */

let overview: unknown;

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: overview,
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
    listingCount: 1230,
    orderCount: 0,
    productCount: 456,
    readiness: 'ready',
    ...overrides,
  };
}

beforeEach(() => {
  overview = {
    shop: { productCount: 2951, connectedChannelCount: 25, publishableChannelCount: 11 },
    channels: [
      channel(),
      channel({
        mallKey: 'kidsnote', mallName: '키즈노트', imported: false,
        listingCount: 0, orderCount: 0, productCount: 0, readiness: 'needs_profile',
      }),
    ],
  };
});

/** 상품등록 보드에도 같은 몰 이름이 서므로 섹션을 좁혀서 카드를 집는다. */
function cardIn(sectionName: RegExp, mallName: string): HTMLElement {
  const section = screen.getByRole('heading', { name: sectionName })
    .closest('section') as HTMLElement;
  return within(section).getByText(mallName).closest('article') as HTMLElement;
}

describe('쇼핑몰 현황 허브', () => {
  it('중앙에 우리 숫자를 세운다', () => {
    render(<MallChannelsPage />);
    expect(screen.getByText('2,951')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('거래가 있는 몰과 연결만 된 몰을 나눈다', () => {
    render(<MallChannelsPage />);
    expect(screen.getByText('거래가 있는 몰')).toBeInTheDocument();
    expect(screen.getByText(/연결만 된 몰/)).toBeInTheDocument();
  });

  it('가져온 몰만 숫자를 보여준다', () => {
    render(<MallChannelsPage />);
    const coupang = cardIn(/거래가 있는 몰/, '쿠팡(마켓플레이스)');
    expect(within(coupang).getByText('1,230')).toBeInTheDocument();
    expect(within(coupang).getByText('456')).toBeInTheDocument();
  });

  it('안 가져온 몰은 0 을 찍지 않는다', () => {
    // 모르는 것을 0 으로 찍지 않는다. 예전에는 같은 안내 문장을 카드마다 붙였는데,
    // 스물일곱 장에 같은 줄이 반복되면 아무도 읽지 않아서 뺐다. 규칙은 그대로다.
    render(<MallChannelsPage />);
    const kidsnote = cardIn(/연결만 된 몰/, '키즈노트');
    expect(within(kidsnote).queryByText('0')).not.toBeInTheDocument();
  });

  it('상품등록 보드가 맨 위에서 몰마다 불을 켠다', () => {
    render(<MallChannelsPage />);
    const board = screen.getByRole('heading', { name: /상품등록/ })
      .closest('section') as HTMLElement;
    // 연결된 키즈노트는 초록, 계정이 없는 몰은 빨강.
    expect(within(board).getAllByLabelText('등록 가능').length).toBeGreaterThan(0);
    expect(within(board).getAllByLabelText('등록 불가').length).toBeGreaterThan(0);
  });

  it('보낼 수 있는 몰에만 등록 배지를 단다', () => {
    overview = {
      shop: { productCount: 1, connectedChannelCount: 2, publishableChannelCount: 1 },
      channels: [
        channel({ mallKey: 'coupang', canPublish: true }),
        channel({ mallKey: 'rocket', mallName: '쿠팡 로켓', canPublish: false, orderCount: 113 }),
      ],
    };
    render(<MallChannelsPage />);
    expect(screen.getAllByText('등록')).toHaveLength(1);
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
