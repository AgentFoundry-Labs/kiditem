import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import { MallAccountSettingsDialog } from './MallAccountSettingsDialog';

/**
 * 쇼핑몰 현황이 여는 계정 설정 창이 지키는 것(사장님 2026-09-19 "… 모달로 빼던지 비번 변경은?").
 *
 *  1. 몰 하나의 창에서 비밀번호를 바꾼다 — 고쳐 쓰고 저장하면 그 값을 보낸다.
 *  2. 몰 하나의 창은 저장된 비밀번호를 열자마자 보인다("기존 비밀번호 보이게 해줘야지"). 보기만 한 것은 변경이 아니다.
 *  3. `all` 은 예전 쇼핑몰 계정 화면의 표 전체다 — 27개 비밀번호를 한꺼번에 받지 않는다.
 */

let accounts: OrderCollectionMallAccount[];
const mockUpdate = vi.fn();
const mockPassword = vi.fn();
const mockUpdateListingProfile = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: accounts, isLoading: false, isError: false, error: null }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/lib/order-mall-account-api', () => ({
  orderMallAccountApi: {
    list: vi.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
    password: (...args: unknown[]) => mockPassword(...args),
    updateListingProfile: (...args: unknown[]) => mockUpdateListingProfile(...args),
  },
}));

// 로그인 테스트는 확장을 부른다. 그 동작은 훅 스펙이 본다.
vi.mock('../hooks/use-mall-login-test', () => ({
  useMallLoginTest: () => ({ testingKey: null, results: {}, test: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function account(overrides: Partial<OrderCollectionMallAccount>): OrderCollectionMallAccount {
  return {
    key: 'kidsnote',
    name: '키즈노트',
    configured: true,
    enabled: true,
    loginId: 'store_kiditem',
    supplierLoginId: null,
    hasPassword: true,
    siteUrl: 'https://seller.kidsnote.com',
    memo: null,
    passwordUpdatedAt: null,
    updatedAt: null,
    channelAccountId: 'row-kidsnote',
    listingProfile: null,
    ...overrides,
  };
}

beforeEach(() => {
  accounts = [
    account({}),
    account({ key: 'onch', name: '온채널', loginId: null, hasPassword: false, configured: false, siteUrl: null }),
  ];
  mockUpdate.mockReset().mockResolvedValue({});
  mockPassword.mockReset().mockResolvedValue({ key: 'kidsnote', password: 'saved-pass' });
  mockUpdateListingProfile.mockReset().mockResolvedValue({});
});

describe('쇼핑몰 계정 설정 창', () => {
  it('⭐ 몰 하나의 창에서 비밀번호를 바꾼다 — 고쳐 쓰고 저장하면 그 값을 보낸다', async () => {
    const user = userEvent.setup();
    render(<MallAccountSettingsDialog target="kidsnote" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '키즈노트 계정 설정' });
    const save = within(dialog).getByRole('button', { name: '저장' });
    const input = await within(dialog).findByDisplayValue('saved-pass');
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'new-pass');
    expect(within(dialog).getByText('저장하면 이 비밀번호로 바뀝니다.')).toBeInTheDocument();
    await user.click(save);

    expect(mockUpdate).toHaveBeenCalledWith('kidsnote', {
      loginId: 'store_kiditem',
      supplierLoginId: '',
      siteUrl: 'https://seller.kidsnote.com',
      memo: '',
      enabled: true,
      password: 'new-pass',
    });
  });

  it('⭐ 몰 하나의 창은 저장된 비밀번호를 열자마자 보인다 — 보기만 한 것은 변경이 아니다', async () => {
    const user = userEvent.setup();
    render(<MallAccountSettingsDialog target="kidsnote" onClose={vi.fn()} />);

    const input = await screen.findByDisplayValue('saved-pass');
    expect(input).toHaveAttribute('type', 'text');
    expect(mockPassword).toHaveBeenCalledTimes(1);
    expect(mockPassword).toHaveBeenCalledWith('kidsnote');
    expect(screen.getByText('저장된 비밀번호입니다. 바꾸려면 고쳐 쓰고 저장하세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();

    // 눈으로 가렸다 다시 보면 받아 둔 값을 그대로 쓴다 — 다시 부르지 않는다.
    await user.click(screen.getByRole('button', { name: '키즈노트 비밀번호 가리기' }));
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: '키즈노트 비밀번호 보기' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(mockPassword).toHaveBeenCalledTimes(1);
  });

  it('저장된 비밀번호가 없는 몰은 부르지 않는다', () => {
    render(<MallAccountSettingsDialog target="onch" onClose={vi.fn()} />);
    expect(screen.getByLabelText('온채널 비밀번호')).toHaveValue('');
    expect(mockPassword).not.toHaveBeenCalled();
  });

  it('`all` 은 모든 몰의 계정 표다 — 비밀번호를 한꺼번에 받지 않는다', () => {
    render(<MallAccountSettingsDialog target="all" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '쇼핑몰 계정' });
    expect(within(dialog).getByText('키즈노트')).toBeInTheDocument();
    expect(within(dialog).getByText('온채널')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /변경사항 저장/ })).toBeDisabled();
    expect(mockPassword).not.toHaveBeenCalled();
  });

  it('계정 목록에 없는 몰은 없다고 적는다', () => {
    render(<MallAccountSettingsDialog target="toss" mallName="토스쇼핑" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '토스쇼핑 계정 설정' });
    expect(within(dialog).getByText(/이 몰은 쇼핑몰 계정 목록에 없습니다/)).toBeInTheDocument();
  });

  it('닫기를 누르면 창을 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MallAccountSettingsDialog target="kidsnote" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('대상이 없으면 창이 없다', () => {
    render(<MallAccountSettingsDialog target={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/**
 * 등록 기본값(KID-235) — 몰 카드의 `needs_profile` 을 사람이 풀 수 있는 자리. 계정 저장과 따로 저장한다.
 * 필드 · 라벨 · 순서는 서버 문서 정의(`MALL_LISTING_PROFILE_FIELDS`)와 같다.
 */
describe('쇼핑몰 계정 설정 창 — 등록 기본값', () => {
  const LABELS = ['몰 카테고리 코드', '배송비 정책', '반품·교환비', '출고지', '반품지', 'A/S 연락처', '상품명 접두어', '상품명 접미어'];

  it.each(['coupang-direct', 'icecream-mall'] as const)('%s는 등록 기본값을 숨기고 로그인 계정은 계속 편집한다', async (key) => {
    accounts = [account({ key, name: '수집 전용 몰', channelAccountId: 'rocket-row', hasPassword: false })];
    const user = userEvent.setup();
    render(<MallAccountSettingsDialog target={key} onClose={vi.fn()} />);

    expect(screen.queryByRole('region', { name: '등록 기본값' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '등록 기본값 저장' })).not.toBeInTheDocument();
    const login = screen.getByDisplayValue('store_kiditem');
    await user.clear(login);
    await user.type(login, 'new-login');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(mockUpdate).toHaveBeenCalledWith(key, expect.objectContaining({ loginId: 'new-login' }));
    expect(mockUpdateListingProfile).not.toHaveBeenCalled();
  });

  it('⭐ 몰 하나의 창에 등록 기본값 절이 서버 문서와 같은 여덟 칸으로 선다', () => {
    render(<MallAccountSettingsDialog target="kidsnote" onClose={vi.fn()} />);
    const section = screen.getByRole('region', { name: '등록 기본값' });
    expect(within(section).getAllByRole('textbox').map((input) => input.getAttribute('aria-label'))).toEqual(LABELS);
    expect(within(section).getByRole('button', { name: '등록 기본값 저장' })).toBeDisabled();
  });

  it('⭐ 고친 칸만 보낸다 — 기록 항목은 { summary }, 비운 칸은 null', async () => {
    accounts = [account({
      listingProfile: {
        shipping: null,
        returnPolicy: { summary: '반품 5,000원' },
        releaseAddress: null,
        returnAddress: null,
        asPhone: null,
        categoryCode: null,
        namePrefix: '[키드]',
        nameSuffix: null,
      },
    })];
    const user = userEvent.setup();
    render(<MallAccountSettingsDialog target="kidsnote" onClose={vi.fn()} />);
    const section = screen.getByRole('region', { name: '등록 기본값' });

    expect(within(section).getByLabelText('반품·교환비')).toHaveValue('반품 5,000원');
    await user.type(within(section).getByLabelText('몰 카테고리 코드'), '12345');
    await user.type(within(section).getByLabelText('배송비 정책'), '기본 3,000원');
    await user.clear(within(section).getByLabelText('반품·교환비'));
    await user.clear(within(section).getByLabelText('상품명 접두어'));
    await user.click(within(section).getByRole('button', { name: '등록 기본값 저장' }));

    expect(mockUpdateListingProfile).toHaveBeenCalledWith('kidsnote', {
      categoryCode: '12345',
      shipping: { summary: '기본 3,000원' },
      returnPolicy: null,
      namePrefix: null,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('summary 없이 저장된 기록은 읽기만 보이고, 덮어쓰기를 누른 뒤에만 새 값으로 바꾼다', async () => {
    accounts = [account({
      listingProfile: {
        shipping: null,
        returnPolicy: null,
        releaseAddress: { zipCode: '10000' },
        returnAddress: null,
        asPhone: null,
        categoryCode: null,
        namePrefix: null,
        nameSuffix: null,
      },
    })];
    const user = userEvent.setup();
    render(<MallAccountSettingsDialog target="kidsnote" onClose={vi.fn()} />);
    const section = screen.getByRole('region', { name: '등록 기본값' });

    expect(within(section).queryByLabelText('출고지')).not.toBeInTheDocument();
    expect(within(section).getByText('{"zipCode":"10000"}')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: '출고지 덮어쓰기' }));
    await user.type(within(section).getByLabelText('출고지'), '서울 물류센터');
    await user.click(within(section).getByRole('button', { name: '등록 기본값 저장' }));

    expect(mockUpdateListingProfile).toHaveBeenCalledWith('kidsnote', {
      releaseAddress: { summary: '서울 물류센터' },
    });
  });

  it('계정 행이 없는 몰은 로그인부터 저장하라고 하고 저장을 막는다', () => {
    accounts = [account({ channelAccountId: null, configured: false, loginId: null, hasPassword: false })];
    render(<MallAccountSettingsDialog target="kidsnote" onClose={vi.fn()} />);
    const section = screen.getByRole('region', { name: '등록 기본값' });
    expect(within(section).getByText(/계정을 먼저 저장하면/)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: '등록 기본값 저장' })).toBeDisabled();
  });

  it('`all` 표에는 등록 기본값 절이 없다', () => {
    render(<MallAccountSettingsDialog target="all" onClose={vi.fn()} />);
    expect(screen.queryByRole('region', { name: '등록 기본값' })).not.toBeInTheDocument();
  });
});
