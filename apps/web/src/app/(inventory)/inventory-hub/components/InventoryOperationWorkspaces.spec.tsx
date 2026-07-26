import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RocketInventoryWorkspace } from './InventoryOperationWorkspaces';

vi.mock('./ChannelAvailability', () => ({ default: () => <div>availability evidence</div> }));

describe('inventory operation workspaces', () => {
  it('keeps Rocket channel availability in its dedicated workspace', () => {
    render(<RocketInventoryWorkspace />);

    expect(screen.getByText('availability evidence')).toBeInTheDocument();
    expect(screen.getByText(/Sellpia 현재고를 수정하지 않습니다/)).toBeInTheDocument();
  });
});
