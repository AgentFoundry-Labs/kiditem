import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-error';
import { SellpiaSyncAction } from './SellpiaSyncAction';

const sourceOwner = vi.hoisted(() => ({
  start: vi.fn(),
  confirmSourceBinding: vi.fn(),
  isStarting: false,
  isConfirming: false,
  state: null,
}));

vi.mock('./sellpia-inventory-source-owner', () => ({
  useSellpiaInventorySourceOwner: () => sourceOwner,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe('SellpiaSyncAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceOwner.start.mockReset();
    sourceOwner.confirmSourceBinding.mockReset();
    sourceOwner.isStarting = false;
    sourceOwner.isConfirming = false;
    sourceOwner.state = null;
  });

  it('keeps a user-facing API error from the owner start request', async () => {
    sourceOwner.start.mockRejectedValue(
      new ApiError(409, 'ATTEMPT_IN_PROGRESS', '셀피아 재고 수집이 이미 진행 중입니다.'),
    );
    render(<SellpiaSyncAction />);

    fireEvent.click(screen.getByRole('button', { name: '셀피아 재고 동기화' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      '셀피아 재고 수집이 이미 진행 중입니다.',
    ));
  });

  it('uses the schema-drift sentinel instead of exposing Zod details', async () => {
    sourceOwner.start.mockRejectedValue(new ZodError([{
      code: 'unrecognized_keys',
      keys: ['fileHash'],
      path: [],
      message: 'Unrecognized key(s) in object: fileHash',
    }]));
    render(<SellpiaSyncAction />);

    fireEvent.click(screen.getByRole('button', { name: '셀피아 재고 동기화' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      '응답 형식 오류 — 개발팀에 문의하세요',
    ));
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('fileHash'));
  });

  it('leaves a polled RUNNING attempt clickable for explicit resume', async () => {
    sourceOwner.state = {
      status: 'syncing',
      lastVerifiedAt: null,
      errorMessage: null,
    };
    sourceOwner.start.mockResolvedValue({ state: 'RUNNING' });
    render(<SellpiaSyncAction />);

    const button = screen.getByRole('button', { name: '셀피아 재고 동기화' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => expect(sourceOwner.start).toHaveBeenCalledTimes(1));
  });

  it('disables the action only while an explicit start is in flight', () => {
    sourceOwner.isStarting = true;
    sourceOwner.state = {
      status: 'syncing',
      lastVerifiedAt: null,
      errorMessage: null,
    };
    render(<SellpiaSyncAction />);

    expect(screen.getByRole('button', { name: '셀피아 재고 동기화' })).toBeDisabled();
  });

  it('offers explicit source-binding confirmation when the owner reports it is missing', async () => {
    sourceOwner.state = {
      status: 'refresh_required',
      lastVerifiedAt: null,
      errorMessage: null,
      sourceBindingConfirmed: false,
    };
    sourceOwner.confirmSourceBinding.mockResolvedValue({ status: 'refresh_required' });
    render(<SellpiaSyncAction />);

    expect(screen.getByText(/https:\/\/kiditem\.sellpia\.com · kiditem/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '셀피아 계정 연결 확인' }));

    await waitFor(() => expect(sourceOwner.confirmSourceBinding).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith('셀피아 계정 연결이 확인되었습니다.');
  });
});
