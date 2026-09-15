import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HubPage from '../page';

describe('첫 화면 — 작업 공간 고르기', () => {
  it('⭐ Agent OS · Agent Org · Dashboard 가 이 순서로 서고, Agent Org 가 가운데다', () => {
    render(<HubPage />);
    const cards = screen.getAllByRole('link');
    expect(cards.map((card) => [card.getAttribute('href'), card.querySelector('h2')?.textContent])).toEqual([
      ['/agent-os', 'Agent OS'],
      ['/agent-org', 'Agent Org'],
      ['/dashboard', 'Dashboard'],
    ]);
  });
});
