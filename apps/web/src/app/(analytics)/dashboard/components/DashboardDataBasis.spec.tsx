import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DashboardBasisDisclosure,
  DashboardDataBasis,
  basisHasValues,
  basisSummary,
  type DashboardComparisonBasis,
  type DashboardPeriodBasis,
  type DashboardMetricBasis,
} from './DashboardDataBasis';

const periodBasis: DashboardPeriodBasis = {
  kind: 'period',
  from: '2026-09-01',
  to: '2026-09-03',
  targetDays: 3,
  includedDates: ['2026-09-01', '2026-09-03'],
  includedDays: 2,
  missingDates: ['2026-09-02'],
  invalidDates: [],
  sources: ['sellpia_sales', 'coupang_ads'],
  status: 'partial',
  partial: true,
  observedAt: '2026-09-04T00:00:00.000Z',
};

const MONTH = Array.from({ length: 30 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`);

describe('DashboardDataBasis', () => {
  it('keeps the summary beside the value and carries no affordance of its own', () => {
    render(<DashboardDataBasis basis={periodBasis} />);

    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('부분 집계');
    // The dates are what crowded the cards, and the trigger that reached them
    // is what multiplied across the page. Both now live at section level.
    expect(screen.queryByText(/누락 날짜/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('treats a period basis with included dates as having values', () => {
    expect(basisHasValues(periodBasis)).toBe(true);
  });

  it('shows every evidence date and never substitutes observedAt for snapshot asOf', () => {
    const snapshot: DashboardMetricBasis = {
      kind: 'snapshot',
      asOf: null,
      observedAt: '2026-09-04T00:00:00.000Z',
      sources: ['inventory_snapshot'],
      status: 'stale',
      partial: false,
      withheldCount: 0,
    };

    render(<DashboardDataBasis basis={snapshot} />);

    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('스냅샷 오래됨');
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('기준 시점 확인 불가');
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('관측 2026-09-04T00:00:00.000Z');
    expect(screen.getByTestId('dashboard-data-basis')).not.toHaveTextContent('기준시점 2026-09-04');
  });

  it('shows current and previous comparison bases with matched offsets', async () => {
    const comparison: DashboardComparisonBasis = {
      kind: 'comparison',
      current: {
        ...periodBasis,
        from: '2026-09-01',
        to: '2026-09-03',
        includedDates: ['2026-09-01', '2026-09-03'],
        missingDates: ['2026-09-02'],
        includedDays: 2,
      },
      previous: {
        ...periodBasis,
        from: '2026-08-25',
        to: '2026-08-27',
        includedDates: ['2026-08-25', '2026-08-27'],
        missingDates: ['2026-08-26'],
        includedDays: 2,
      },
      matchedOffsets: [0, 2],
      status: 'comparable',
      reason: null,
    };

    render(<DashboardBasisDisclosure label="기간 지표 근거" entries={[{ label: '월 순이익', basis: comparison }]} />);

    fireEvent.click(screen.getByRole('button', { name: /^기간\ 지표\ 근거\ 안내/ }));

    const note = await screen.findByRole('note');
    // A comparison is two measured windows, so it never collapses to one row.
    const current = within(note).getByRole('row', { name: /월 순이익 · 현재/ });
    const previous = within(note).getByRole('row', { name: /월 순이익 · 이전/ });
    expect(current).toHaveTextContent('2026-09-01 ~ 2026-09-03');
    expect(current).toHaveTextContent('2026-09-01, 2026-09-03');
    expect(previous).toHaveTextContent('2026-08-25 ~ 2026-08-27');
    expect(previous).toHaveTextContent('2026-08-25, 2026-08-27');
    expect(note).toHaveTextContent('공통 오프셋 0, 2');
    expect(basisSummary(comparison)).toContain('공통 오프셋 0, 2');
  });

  it('never states one basis for values whose bases differ', async () => {
    const wideWindow: DashboardPeriodBasis = {
      ...periodBasis,
      from: '2026-09-01',
      to: '2026-09-30',
      targetDays: 30,
      sources: ['orders'],
    };

    render(
      <DashboardBasisDisclosure
        label="기간 지표 근거"
        entries={[
          { label: '월 매출', basis: wideWindow },
          { label: '광고비율', basis: periodBasis },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^기간\ 지표\ 근거\ 안내/ }));

    const note = await screen.findByRole('note');
    expect(note).not.toHaveTextContent('모든 값 공통');
    expect(within(note).getByRole('row', { name: /월 매출/ })).toHaveTextContent('2026-09-01 ~ 2026-09-30');
    // The server's own vocabulary on the wire; the operator's words on screen.
    expect(within(note).getByRole('row', { name: /월 매출/ })).toHaveTextContent('주문');
    expect(note).not.toHaveTextContent('orders');
    expect(within(note).getByRole('row', { name: /광고비율/ })).toHaveTextContent('2026-09-01 ~ 2026-09-03');
    expect(within(note).getByRole('row', { name: /광고비율/ })).toHaveTextContent('셀피아 판매현황 · 쿠팡 광고');
  });

  it('states a snapshot fact once when every value agrees and per value when they do not', async () => {
    const snapshot = (sources: string[]): DashboardMetricBasis => ({
      kind: 'snapshot',
      asOf: '2026-09-11',
      observedAt: null,
      sources,
      status: 'current',
      partial: false,
      withheldCount: 0,
    });

    render(
      <DashboardBasisDisclosure
        label="스냅샷 지표 근거"
        entries={[
          { label: '적자 상품', basis: snapshot(['orders', 'channel_listings']) },
          { label: '셀피아 재고 0', basis: snapshot(['sellpia_inventory']) },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^스냅샷\ 지표\ 근거\ 안내/ }));

    const note = await screen.findByRole('note');
    // The as-of really is shared, so it is said once; the sources are not.
    expect(note).toHaveTextContent('기준시점 2026-09-11 (모든 값 공통)');
    expect(within(note).getByRole('row', { name: /적자 상품/ })).toHaveTextContent('주문 · 채널 리스팅');
    expect(within(note).getByRole('row', { name: /셀피아 재고 0/ })).toHaveTextContent('셀피아 재고');
  });

  it('gives a day-coverage manifest a row instead of a help affordance of its own', async () => {
    render(
      <DashboardBasisDisclosure
        label="기간 지표 근거"
        entries={[{
          label: '광고 커버리지',
          coverage: { from: '2026-09-01', to: '2026-09-10', targetDays: 10, completedDays: 0, missingDates: ['2026-09-01', '2026-09-02'] },
          coverageSources: ['coupang_ads'],
        }]}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^기간\ 지표\ 근거\ 안내/ }));

    const row = within(await screen.findByRole('note')).getByRole('row', { name: /광고 커버리지/ });
    expect(row).toHaveTextContent('0/10일');
    expect(row).toHaveTextContent('2일 · 2026-09-01, 2026-09-02');
  });

  /**
   * The ⓘ used to open on a table of the server's own words — `orders`,
   * `wing_traffic` — over a comma-joined list of thirty ISO dates. That is the
   * data, not the answer. A reader opens it to find out whether the number is a
   * measurement and, when it is not, what to run.
   */
  it('says how the value was measured before showing the working', async () => {
    render(
      <DashboardBasisDisclosure
        label="기간 지표 근거"
        entries={[{
          label: '월 매출',
          basis: {
            kind: 'period', from: '2026-09-01', to: '2026-09-30', targetDays: 30,
            includedDates: [], includedDays: 0, missingDates: MONTH, invalidDates: [],
            sources: ['wing_traffic'], status: 'empty', partial: false,
          } as DashboardMetricBasis,
        }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^기간\ 지표\ 근거\ 안내/ }));
    const note = await screen.findByRole('note');

    expect(note).toHaveTextContent(
      'Wing 트래픽에서 이 기간에 수집된 날이 없어 값을 내지 않았습니다. Wing 일별 트래픽을 실행하면 채워집니다.',
    );
    // A whole month of absent days is one fact, not thirty.
    expect(note).toHaveTextContent('30일 전체');
    expect(note).not.toHaveTextContent('2026-09-17');
  });

  it('collapses a run of absent days and keeps a short list as dates', async () => {
    const basis = (missingDates: string[]): DashboardMetricBasis => ({
      kind: 'period', from: '2026-09-01', to: '2026-09-10', targetDays: 10,
      includedDates: [], includedDays: 0, missingDates, invalidDates: [],
      sources: ['orders'], status: 'partial', partial: true,
    } as DashboardMetricBasis);

    const { rerender } = render(
      <DashboardBasisDisclosure label="기간 지표 근거" entries={[{ label: '월 매출', basis: basis(['2026-09-02', '2026-09-03', '2026-09-04']) }]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^기간\ 지표\ 근거\ 안내/ }));
    expect(await screen.findByRole('note')).toHaveTextContent('3일 · 2026-09-02 ~ 2026-09-04');

    rerender(
      <DashboardBasisDisclosure label="기간 지표 근거" entries={[{ label: '월 매출', basis: basis(['2026-09-02', '2026-09-05']) }]} />,
    );
    // Two days is not a range; a span there costs a subtraction and saves nothing.
    expect(await screen.findByRole('note')).toHaveTextContent('2일 · 2026-09-02, 2026-09-05');
  });

  it('renders nothing when no value in the section published a basis', () => {
    const { container } = render(
      <DashboardBasisDisclosure label="기간 지표 근거" entries={[{ label: '월 매출', basis: null }]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('labels the section affordance for a screen reader and keeps it focusable', () => {
    render(<DashboardBasisDisclosure label="기간 지표 근거" entries={[{ label: '월 매출', basis: periodBasis }]} />);

    const trigger = screen.getByRole('button', { name: /^기간\ 지표\ 근거\ 안내/ });
    trigger.focus();
    expect(trigger).toHaveFocus();
  });

  it('keeps numeric values visible for an unknown snapshot', () => {
    expect(basisHasValues({
      kind: 'snapshot',
      asOf: null,
      observedAt: null,
      sources: ['inventory_snapshot'],
      status: 'unknown',
      partial: false,
      withheldCount: 0,
    })).toBe(true);
  });

  it('says how much of the population a partial snapshot left out', () => {
    const partialSnapshot: DashboardMetricBasis = {
      kind: 'snapshot',
      asOf: '2026-09-10',
      observedAt: null,
      sources: ['orders', 'channel_listings'],
      status: 'current',
      partial: true,
      withheldCount: 2,
    };

    render(<DashboardDataBasis basis={partialSnapshot} />);

    // A non-empty valid subset keeps its number on screen; only the coverage
    // is qualified, and the count is what makes "partial" mean something.
    expect(basisHasValues(partialSnapshot)).toBe(true);
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('스냅샷 현재');
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('부분 집계 · 근거 부족 2건 제외');
  });

  it('names the withheld population as the reason an unavailable snapshot has no number', () => {
    const emptySubset: DashboardMetricBasis = {
      kind: 'snapshot',
      asOf: null,
      observedAt: null,
      sources: ['orders', 'channel_listings'],
      status: 'unavailable',
      partial: false,
      withheldCount: 2,
    };

    // Nothing was measurable, so the card blanks — and says why rather than
    // leaving the reader with a bare "사용 불가".
    expect(basisHasValues(emptySubset)).toBe(false);
    expect(basisSummary(emptySubset)).toContain('근거 부족 2건');
  });

  it('distinguishes a failed source query from an ordinary empty period', () => {
    const failedPeriod = {
      ...periodBasis,
      status: 'unverified' as const,
      partial: false,
      includedDates: [],
    includedDays: 0,
    missingDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    queryFailedSources: ['coupang_ads'],
    };

    render(<DashboardDataBasis basis={failedPeriod} />);

    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('조회 실패 · 쿠팡 광고');
  });
});
