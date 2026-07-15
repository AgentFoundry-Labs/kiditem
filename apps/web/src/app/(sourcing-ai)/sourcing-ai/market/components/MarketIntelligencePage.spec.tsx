import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketIntelligencePage } from './MarketIntelligencePage';

vi.mock('../../components/SellochMarketAnalysisPage', () => ({
  SellochMarketAnalysisPage: () => <div>Wing panel</div>,
}));
vi.mock('./GlobalSourcingOverview', () => ({
  GlobalSourcingOverview: () => <div>Overview panel</div>,
}));
vi.mock('./TrendCollectionSection', () => ({
  TrendCollectionSection: () => <div>Collection panel</div>,
}));
vi.mock('./TrendRadarSection', () => ({
  TrendRadarSection: () => <div>Radar panel</div>,
}));
vi.mock('./CompetitorSignalsSection', () => ({
  CompetitorSignalsSection: () => <div>Competitor panel</div>,
}));

describe('MarketIntelligencePage tabs', () => {
  it('moves selection and focus with horizontal arrow keys', () => {
    render(<MarketIntelligencePage />);
    const tabs = screen.getAllByRole('tab');

    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });

    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Radar panel')).toBeInTheDocument();
  });

  it('supports Home and End keys', () => {
    render(<MarketIntelligencePage />);
    const tabs = screen.getAllByRole('tab');

    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(tabs.at(-1)).toHaveFocus();

    fireEvent.keyDown(tabs.at(-1)!, { key: 'Home' });
    expect(tabs[0]).toHaveFocus();
  });
});
