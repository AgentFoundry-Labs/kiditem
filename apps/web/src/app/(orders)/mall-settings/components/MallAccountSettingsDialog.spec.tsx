import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderCollectionMallAccount } from '../../order-collection/lib/order-mall-account-api';
import { MallAccountSettingsDialog } from './MallAccountSettingsDialog';

/**
 * 쇼핑몰 현황이 여는 계정 설정 창이 지키는 것(사장님 2026-09-19 "… 모달로 빼던지 비번 변경은?").
 *
 *  1. 몰 하나의 창에서 비밀번호를 바꾼다 — 새 비밀번호를 적고 저장하면 그 값을 보낸다.
 *  2. 저장된 비밀번호는 눈을 누른 그때만 불러오고, 보기만 한 것은 변경이 아니다.
 *  3. `all` 은 예전 쇼핑몰 계정 화면의 표 전체다.
 */

let accounts: OrderCollectionMallAccount[];
const mockUpdate = vi.fn();
const mockPassword = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: accounts, isLoading: false, isError: false, error: null }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../order-collection/lib/order-mall-account-api', () => ({
  orderMallAccountApi: {
    list: vi.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
    password: (...args: unknown[]) => mockPassword(...args),
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
});

describe('쇼핑몰 계정 설정 창', () => {
  it('⭐ 몰 하나의 창에서 비밀번호를 바꾼다 — 새 비밀번호를 적고 저장하면 그 값을 보낸다', async () => {
    const user = userEvent.setup();
    render(<MallAccountSettingsDialog target="kidsnote" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '키즈노트 계정 설정' });
    const save = within(dialog).getByRole('button', { name: '저장' });
    expect(save).toBeDisabled();
    expect(within(dialog).getByText('바꾸려면 새 비밀번호를 적고 저장하세요. 비워 두면 그대로입니다.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('키즈노트 비밀번호'), 'new-pass');
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

  it('저장된 비밀번호는 눈을 누른 그때만 불러오고, 보기만 한 것은 변경이 아니다', async () => {
    const user = userEvent.setup();
    render(<MallAccountSettingsDialog target="kidsnote" onClose={vi.fn()} />);
    expect(mockPassword).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '키즈노트 비밀번호 보기' }));

    expect(mockPassword).toHaveBeenCalledWith('kidsnote');
    expect(screen.getByLabelText('키즈노트 비밀번호')).toHaveValue('saved-pass');
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('`all` 은 모든 몰의 계정 표다', () => {
    render(<MallAccountSettingsDialog target="all" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '쇼핑몰 계정' });
    expect(within(dialog).getByText('키즈노트')).toBeInTheDocument();
    expect(within(dialog).getByText('온채널')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /변경사항 저장/ })).toBeDisabled();
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
