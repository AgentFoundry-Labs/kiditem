import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RocketStockEvents from './RocketStockEvents';

const postRocketInventoryEvent = vi.hoisted(() =>
  vi.fn(async () => ({ ledgerId: 'ledger-1', alreadyApplied: false })),
);
const mockSearchParams = vi.hoisted(() => ({
  current: new URLSearchParams(),
}));

vi.mock('../../_shared/inventory-api', () => ({
  postRocketInventoryEvent,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams.current,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.current = new URLSearchParams();
});

describe('RocketStockEvents', () => {
  it('submits a return/restock event with required source reference', async () => {
    render(<RocketStockEvents />);

    await userEvent.type(screen.getByLabelText('Inventory ID'), '00000000-0000-4000-8000-000000000001');
    await userEvent.type(screen.getByLabelText('Option ID'), '00000000-0000-4000-8000-000000000002');
    await userEvent.selectOptions(screen.getByLabelText('Event type'), 'return_restock');
    await userEvent.type(screen.getByLabelText('Quantity'), '2');
    await userEvent.type(screen.getByLabelText('Source reference'), 'return-1');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(postRocketInventoryEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'return_restock',
      quantity: 2,
      sourceRef: 'return-1',
    }));
    expect(await screen.findByText('ledger-1')).toBeInTheDocument();
  });

  it('requires override reason for issue over open reservation', async () => {
    render(<RocketStockEvents />);

    await userEvent.type(screen.getByLabelText('Inventory ID'), '00000000-0000-4000-8000-000000000001');
    await userEvent.type(screen.getByLabelText('Option ID'), '00000000-0000-4000-8000-000000000002');
    await userEvent.selectOptions(screen.getByLabelText('Event type'), 'issue');
    await userEvent.type(screen.getByLabelText('Quantity'), '5');
    await userEvent.type(screen.getByLabelText('Open reservation'), '3');
    await userEvent.type(screen.getByLabelText('Source reference'), 'shipment-1');
    await userEvent.click(screen.getByLabelText('Allow over-reservation'));
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(await screen.findByText('초과 출고 사유를 입력하세요.')).toBeInTheDocument();
    expect(postRocketInventoryEvent).not.toHaveBeenCalled();
  });

  it('prefills Rocket event form from query params', () => {
    mockSearchParams.current = new URLSearchParams('eventType=issue&sourceRef=shipment-2026-06-29&quantity=2');

    render(<RocketStockEvents />);

    expect(screen.getByLabelText('Event type')).toHaveValue('issue');
    expect(screen.getByLabelText('Source reference')).toHaveValue('shipment-2026-06-29');
    expect(screen.getByLabelText('Quantity')).toHaveValue(2);
  });

  it('blocks submit until required fields are present', async () => {
    render(<RocketStockEvents />);

    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Inventory ID, Option ID');
    expect(postRocketInventoryEvent).not.toHaveBeenCalled();
  });
});
