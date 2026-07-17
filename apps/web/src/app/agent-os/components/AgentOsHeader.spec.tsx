import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOsHeader } from './AgentOsHeader';

describe('<AgentOsHeader>', () => {
  it('links channel order and inventory shortcuts to the restored screens', () => {
    const { container } = render(<AgentOsHeader ceoName={null} onRefresh={vi.fn()} />);

    expect(container.querySelector('a[href="/orders"]')).not.toBeNull();
    expect(container.querySelector('a[href="/inventory"]')).not.toBeNull();
    expect(container.querySelector('a[href="/order-hub"]')).toBeNull();
    expect(container.querySelector('a[href="/inventory-hub"]')).toBeNull();
  });
});
