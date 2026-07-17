import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUrlControlledTab } from './useUrlControlledTab';

const pushMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({
  pathname: '/inventory-hub',
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => navigation.params,
}));

const values = ['overview', 'inventory', 'attention', 'history'] as const;

describe('useUrlControlledTab', () => {
  beforeEach(() => {
    pushMock.mockReset();
    navigation.pathname = '/inventory-hub';
    navigation.params = new URLSearchParams();
  });

  it('reads selection from the URL and deterministically normalizes invalid values', () => {
    navigation.params = new URLSearchParams('tab=inventory');
    const { result, rerender } = renderHook(() =>
      useUrlControlledTab({ key: 'tab', values, defaultValue: 'overview' }),
    );
    expect(result.current[0]).toBe('inventory');

    navigation.params = new URLSearchParams('tab=unknown');
    rerender();
    expect(result.current[0]).toBe('overview');

    navigation.params = new URLSearchParams('tab=history');
    rerender();
    expect(result.current[0]).toBe('history');
  });

  it('pushes only its owned query key and preserves unrelated parameters', () => {
    navigation.params = new URLSearchParams('query=sku&page=4&tab=overview');
    const { result } = renderHook(() =>
      useUrlControlledTab({ key: 'tab', values, defaultValue: 'overview' }),
    );

    act(() => result.current[1]('attention'));

    expect(pushMock).toHaveBeenCalledWith(
      '/inventory-hub?query=sku&page=4&tab=attention',
    );
  });
});
