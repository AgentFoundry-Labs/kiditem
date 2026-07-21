import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import { RocketAccountBootstrap } from './RocketAccountBootstrap';

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));

const first = {
  id: '11111111-1111-4111-8111-111111111111',
  channel: 'rocket',
  name: '로켓 1호점',
  externalAccountId: null,
  vendorId: 'VENDOR-1',
  sellerId: null,
  isPrimary: true,
};
const second = {
  ...first,
  id: '22222222-2222-4222-8222-222222222222',
  name: '로켓 2호점',
  vendorId: 'VENDOR-2',
  isPrimary: false,
};

describe('<RocketAccountBootstrap />', () => {
  beforeEach(() => vi.clearAllMocks());

  it('auto-propagates the only Rocket account without rendering a selector', async () => {
    vi.mocked(useQuery).mockReturnValue({ data: [first] } as ReturnType<typeof useQuery>);
    const onAccountChange = vi.fn();
    render(<RocketAccountBootstrap onAccountChange={onAccountChange} />);

    await waitFor(() => expect(onAccountChange).toHaveBeenCalledWith({
      id: first.id,
      name: first.name,
      vendorId: first.vendorId,
    }));
    expect(screen.queryByRole('combobox', { name: '로켓 채널 계정' })).toBeNull();
  });

  it('requires an explicit choice when several Rocket accounts are active', async () => {
    vi.mocked(useQuery).mockReturnValue({ data: [first, second] } as ReturnType<typeof useQuery>);
    const onAccountChange = vi.fn();
    const user = userEvent.setup();
    render(<RocketAccountBootstrap onAccountChange={onAccountChange} />);

    expect(onAccountChange).toHaveBeenLastCalledWith(null);
    const selector = screen.getByRole('combobox', { name: '로켓 채널 계정' });
    expect(selector).toHaveValue('');
    await user.selectOptions(selector, second.id);
    expect(onAccountChange).toHaveBeenLastCalledWith({
      id: second.id,
      name: second.name,
      vendorId: second.vendorId,
    });
  });

  it('clears a stale parent selection when account data changes to ambiguous, empty, or missing', async () => {
    const onAccountChange = vi.fn();
    vi.mocked(useQuery).mockReturnValue({ data: [first] } as ReturnType<typeof useQuery>);
    const { rerender } = render(<RocketAccountBootstrap onAccountChange={onAccountChange} />);
    await waitFor(() => expect(onAccountChange).toHaveBeenLastCalledWith({
      id: first.id,
      name: first.name,
      vendorId: first.vendorId,
    }));

    vi.mocked(useQuery).mockReturnValue({ data: [first, second] } as ReturnType<typeof useQuery>);
    rerender(<RocketAccountBootstrap onAccountChange={onAccountChange} />);
    await waitFor(() => expect(onAccountChange).toHaveBeenLastCalledWith(null));

    vi.mocked(useQuery).mockReturnValue({ data: [] } as ReturnType<typeof useQuery>);
    rerender(<RocketAccountBootstrap onAccountChange={onAccountChange} />);
    await waitFor(() => expect(onAccountChange).toHaveBeenLastCalledWith(null));
  });
});
