import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => null,
}));

import QueryProvider from '@/components/providers/QueryProvider';

describe('QueryProvider', () => {
  it('renders children', () => {
    render(
      <QueryProvider>
        <div data-testid="child">hello</div>
      </QueryProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('provides QueryClient to children', () => {
    let client: any;
    function Probe() {
      client = useQueryClient();
      return null;
    }
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );
    expect(client).toBeDefined();
    expect(client.getDefaultOptions().queries?.staleTime).toBe(60_000);
    expect(client.getDefaultOptions().queries?.gcTime).toBe(5 * 60_000);
    expect(client.getDefaultOptions().queries?.retry).toBe(1);
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
});
